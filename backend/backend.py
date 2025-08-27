import time
import logging
import requests
from typing import Dict, Optional
from prometheus_client import CollectorRegistry, Gauge, push_to_gateway, generate_latest

# Logging setup
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

class MetricsBackend:
    def __init__(self, prometheus_gateway_url: str, job_name: str = "metrics_simulator"):
        self.prometheus_gateway_url = prometheus_gateway_url
        self.job_name = job_name
        self.registry = CollectorRegistry()
        self.metrics = {}
        self._test_connectivity()

    def _test_connectivity(self):
        """Test if we can reach the Prometheus pushgateway"""
        try:
            test_url = self.prometheus_gateway_url.replace(':9091', ':9091/metrics')
            response = requests.get(test_url, timeout=5)
            if response.status_code == 200:
                logger.info(f"✅ Connected to Prometheus pushgateway at {self.prometheus_gateway_url}")
            else:
                logger.warning(f"⚠️ Pushgateway responded with status {response.status_code}")
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Cannot connect to pushgateway at {self.prometheus_gateway_url}: {e}")
            logger.info("💡 Make sure pushgateway service is running and accessible")

    def apply_metrics(self, metrics_data: Dict[str, Dict], timestamp: Optional[str] = None):
        if not isinstance(metrics_data, dict):
            return False, "Invalid format: metrics must be a dictionary"

        try:
            for metric_name, metric_info in metrics_data.items():
                value = metric_info.get("value")
                unit = metric_info.get("unit", "")

                if not isinstance(value, (int, float)):
                    logger.warning(f"Skipping {metric_name}: value must be numeric")
                    continue

                clean_metric_name = metric_name.replace('.', '_').replace('-', '_')
                
                if clean_metric_name not in self.metrics:
                    gauge = Gauge(
                        clean_metric_name,
                        f"Simulated metric: {metric_name} ({unit})" if unit else f"Simulated metric: {metric_name}",
                        registry=self.registry
                    )
                    self.metrics[clean_metric_name] = gauge
                else:
                    gauge = self.metrics[clean_metric_name]

                gauge.set(value)
                logger.info(f"📊 Metric set: {clean_metric_name} = {value} {unit}")

            logger.info(f"🚀 Pushing {len(metrics_data)} metrics to {self.prometheus_gateway_url}")
            push_to_gateway(
                gateway=self.prometheus_gateway_url,
                job=self.job_name,
                registry=self.registry
            )

            logger.info(f"✅ Successfully pushed {len(metrics_data)} metric(s) to Prometheus")
            return True, f"{len(metrics_data)} metric(s) pushed to Prometheus"

        except requests.exceptions.ConnectionError as e:
            error_msg = f"Cannot connect to Prometheus pushgateway at {self.prometheus_gateway_url}: {e}"
            logger.error(f"❌ {error_msg}")
            return False, error_msg
        except Exception as e:
            error_msg = f"Failed to apply metrics: {e}"
            logger.error(f"❌ {error_msg}")
            return False, error_msg

    def get_metrics_output(self):
        """Get the current metrics in Prometheus format"""
        try:
            return generate_latest(self.registry).decode("utf-8")
        except Exception as e:
            logger.error(f"Error generating metrics output: {e}")
            return f"# Error generating metrics: {e}\n"

    def get_status(self):
        """Get status information about the metrics backend"""
        return {
            "prometheus_gateway_url": self.prometheus_gateway_url,
            "job_name": self.job_name,
            "total_metrics": len(self.metrics),
            "metric_names": list(self.metrics.keys()) if self.metrics else [],
            "healthy": self._health_check()
        }
    
    def _health_check(self):
        """Check if the pushgateway is accessible"""
        try:
            test_url = self.prometheus_gateway_url.replace(':9091', ':9091/metrics')
            response = requests.get(test_url, timeout=3)
            return response.status_code == 200
        except:
            return False

# Simulator functionality
def simulate_metrics(metrics_backend: MetricsBackend):
    """Simulate realistic system metrics"""
    import random
    
    base_memory = 134217728  # ~128MB
    base_cpu = 1200.5
    base_http_duration = 0.250
    
    sample_metrics = {
        'process_memory_bytes': {
            'value': base_memory + random.randint(-10000000, 20000000), 
            'unit': 'bytes'
        },
        'cpu_seconds_total': {
            'value': base_cpu + random.uniform(0, 10), 
            'unit': 's'
        },
        'http_request_duration_seconds': {
            'value': max(0.001, base_http_duration + random.uniform(-0.1, 0.2)), 
            'unit': 's'
        }
    }

    logger.info("📊 Simulating metrics...")
    success, result = metrics_backend.apply_metrics(sample_metrics)
    
    if success:
        logger.info(f"✅ {result}")
    else:
        logger.error(f"❌ {result}")

def run_simulator():
    """Main simulator loop"""
    import os
    
    # Configuration for simulator
    PROMETHEUS_GATEWAY_URL = os.getenv('PROMETHEUS_GATEWAY_URL', 'http://pushgateway-svc:9091')
    JOB_NAME = os.getenv('METRICS_JOB_NAME', 'metrics_simulator')
    
    logger.info(f"🚀 Starting metrics simulator with:")
    logger.info(f"   Prometheus Gateway: {PROMETHEUS_GATEWAY_URL}")
    logger.info(f"   Job Name: {JOB_NAME}")
    
    metrics_backend = MetricsBackend(
        prometheus_gateway_url=PROMETHEUS_GATEWAY_URL,
        job_name=JOB_NAME
    )
    
    logger.info("🎯 Metrics simulator started - sending metrics every 30 seconds")
    logger.info("   Press Ctrl+C to stop")
    
    try:
        simulate_metrics(metrics_backend)
        while True:
            time.sleep(30)
            simulate_metrics(metrics_backend)
    except KeyboardInterrupt:
        logger.info("🛑 Simulator stopped by user")
    except Exception as e:
        logger.error(f"💥 Simulator crashed: {e}")

if __name__ == "__main__":
    # Run the simulator if this file is executed directly
    run_simulator()