# Birdseye Deployment Guide

## Prerequisites
- Kubernetes cluster with Traefik ingress
- Helm 3.x
- Azure Pipelines
- Self-hosted agent in the Default pool.
- GitHub repository access.
- K3s cluster access (Kubeconfig stored as k3s.yml in Azure DevOps secure files).
- Required secrets and variables set in the k3s-deployment-vars variable group:
`GHCR_USERNAME`
`GHCR_TOKEN`
`DOMAIN`
`RELEASE_NAME`
`NAMESPACE`
`SSL_CLUSTER_ISSUER`
`SSL_SECRET_NAME`
`LETSENCRYPT_EMAIL`
`BACKEND_CPU_LIMIT`
`BACKEND_MEMORY_LIMIT`
`PROMETHEUS_CPU_LIMIT` `PROMETHEUS_MEMORY_LIMIT`
`GRAFANA_CPU_LIMIT` `GRAFANA_MEMORY_LIMIT`
`GRAFANA_ADMIN_USER` `GRAFANA_ADMIN_PASSWORD`


## Deployment Steps
### 1. Trigger the pipeline

### 2. Build Stage
- Backups Repository
- Generates Combined Tag
- Builds Docker Images
- Pushes to GHCR


### 3. Deploy Stage

- Fetches k3s.yml.
- Setups Kubeconfig
- Cleanup Helm releases and old secrets.
- Creates Namespace & Secrets
- Deploys using Helm 


### 4. Post-Deployment

Verify deployment:

```bash kubectl get pods -n <NAMESPACE>
kubectl get services -n <NAMESPACE>
kubectl describe deployment <RELEASE_NAME> -n <NAMESPACE>
```

Confirm frontend and backend images match the generated tag.