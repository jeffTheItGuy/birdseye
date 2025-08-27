#!/bin/bash

set -e


echo "Starting development Docker Compose stack..."

docker compose -f .docker/dev/dev.docker-compose.yml up --build

echo " Deployment complete"