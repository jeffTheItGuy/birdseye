#!/bin/bash

set -e

# Default namespace if not provided
NAMESPACE="birdseye"  # Fixed typo: was "birdeye"

# Allow user to pass in a namespace as an argument
if [ $# -eq 1 ]; then
  NAMESPACE="$1"
fi

echo "🗑️  Cleaning up MyApp deployment in namespace: $NAMESPACE..."

# Since we're not using port-forwards anymore, we don't need to kill them
# But let's clean up any manual port-forwards that might be running
echo "🔌 Stopping any manual port-forwards..."
pkill -f "kubectl port-forward.*$NAMESPACE" 2>/dev/null || true

# Remove Helm release (updated release name to match deploy.sh)
echo "⛵ Uninstalling Helm release..."
helm uninstall birdseye-release -n "$NAMESPACE" 2>/dev/null || echo "Release not found or already uninstalled"

# Delete namespace
echo "🧹 Deleting namespace..."
kubectl delete namespace "$NAMESPACE" --timeout=60s 2>/dev/null || echo "Namespace deletion in progress or already deleted"

# Clean up /etc/hosts entry for birdseye.local (optional)
echo "🌐 Cleaning up /etc/hosts..."
if grep -q "birdseye.local" /etc/hosts; then
    echo "   Removing birdseye.local from /etc/hosts..."
    sudo sed -i '/birdseye\.local/d' /etc/hosts
    echo "   ✅ birdseye.local removed from /etc/hosts"
else
    echo "   ℹ️  birdseye.local not found in /etc/hosts"
fi

# Clean up any leftover k3s images
echo "🧹 Cleaning up k3s images..."
sudo k3s ctr images rm docker.io/myapp/frontend:latest 2>/dev/null || echo "   k3s frontend image not found"
sudo k3s ctr images rm docker.io/myapp/backend:latest 2>/dev/null || echo "   k3s backend image not found"

echo ""
echo "✅ Cleanup complete!"
echo "🌐 birdseye.local has been removed from /etc/hosts"
echo "🐳 Docker images have been cleaned up"
echo "⚠️  If you want to redeploy, run: ./deploy.sh $NAMESPACE"