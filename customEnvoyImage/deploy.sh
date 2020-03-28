#!/usr/bin/env bash

export $(grep -v '^#' .env | xargs)
export $(grep -v '^#' .env.local | xargs)

ENVOY_IMAGE=840364872350.dkr.ecr.ap-southeast-1.amazonaws.com/aws-appmesh-envoy:v1.12.2.1-prod
$(aws ecr get-login --no-include-email --region ap-southeast-1 --registry-id 840364872350)
docker build -t aws-appmesh-envoy:v1.12.2.1-prod --build-arg ENVOY_IMAGE=$ENVOY_IMAGE .
CUSTOM_ENVOY_IMAGE=${ACCOUNT_ID}.dkr.ecr.ap-southeast-1.amazonaws.com/aws-appmesh-envoy:v1.12.2.1-prod
$(aws ecr get-login --no-include-email --region ap-southeast-1)
docker tag aws-appmesh-envoy:v1.12.2.1-prod ${CUSTOM_ENVOY_IMAGE}
docker push ${CUSTOM_ENVOY_IMAGE}