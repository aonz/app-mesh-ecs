#!/bin/bash

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null && pwd )"


# $1= Certificate Name
deploySecret() {
  aws secretsmanager put-secret-value --region ap-southeast-1 \
    --secret-id $1 --secret-string "$(cat $DIR/$1.pem)"
}


main() {
    # Frontend
    deploySecret "ca_backend_cert"
    # Backend
    # deploySecret "backend_cert"
    deploySecret "backend_key"
    deploySecret "backend_cert_chain"
}

main $@