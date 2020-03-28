#!/bin/bash

# $1=Secret Name
getSecret() {
    aws secretsmanager get-secret-value --secret-id $1 | jq -r .SecretString > /keys/${1}.pem
    echo "Added $1 to container"
}

getCertificates() {
    if [[ $CERTIFICATE_NAME = "frontend" ]];
    then
        getSecret "ca_backend_cert"
    fi
    if [[ $CERTIFICATE_NAME = "backend" ]];
    then
        # getSecret "backend_cert"
        getSecret "backend_key"
        getSecret "backend_cert_chain"
    fi
}

# Get the appropriate certificates
getCertificates
# Start Envoy
/usr/bin/envoy-wrapper