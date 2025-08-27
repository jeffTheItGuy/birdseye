#!/bin/bash

set -e

# Default namespace if not provided
NAMESPACE="birdseye"

export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# Allow user to pass in a namespace as an argument
if [ $# -eq 1 ]; then
  NAMESPACE="$1"
fi

DOMAIN="birdseye.local"

echo "🚀 Starting MyApp deployment in namespace: $NAMESPACE..."

# Create namespace if it doesn't exist
echo "🔧 Creating namespace..."
kubectl create namespace $NAMESPACE 2>/dev/null || echo "Namespace already exists"

# Build Docker images
echo "🏗️  Building Docker images..."

echo "📦 Building frontend..."
docker build -f .docker/prod/prodfrontend.Dockerfile -t myapp/frontend:latest .
docker build -f .docker/prod/prodbackend.Dockerfile -t myapp/backend:latest .

echo "📥 Importing images to k3s..."
docker save myapp/frontend:latest > frontend.tar
docker save myapp/backend:latest > backend.tar
sudo k3s ctr images import frontend.tar
sudo k3s ctr images import backend.tar
rm frontend.tar backend.tar

echo "🚢 Deploying with Helm..."
cd .helm/helm-local
helm upgrade --install birdseye-release . --namespace $NAMESPACE --set global.domain=$DOMAIN 

echo "⏱️  Waiting for pods to be ready..."
kubectl wait --for=condition=ready pod -l app=frontend -n $NAMESPACE --timeout=600s
kubectl wait --for=condition=ready pod -l app=backend -n $NAMESPACE --timeout=700s

echo "🌐 Configuring birdseye domain in /etc/hosts..."

NODE_IP=$(kubectl get node -o jsonpath='{.items[0].status.addresses[0].address}' 2>/dev/null || echo "127.0.0.1")

# Add single domain
if ! grep -q "$NODE_IP.*$DOMAIN" /etc/hosts; then
    echo "⚠️  Adding $DOMAIN to /etc/hosts..."
    echo "$NODE_IP $DOMAIN" | sudo tee -a /etc/hosts
    echo "✅ Domain added: $NODE_IP $DOMAIN"
else
    echo "✅ Domain already configured in /etc/hosts"
fi

echo "✅ Deployment complete!"
echo "🌐 Access your app at:"
echo "   Main App: http://$DOMAIN/"
echo "   Grafana : http://$DOMAIN/grafana"
echo "   Prometheus: http://$DOMAIN/prometheus"
echo ""
echo "🗑️  To remove everything, run: ./rollback.sh $NAMESPACE"
