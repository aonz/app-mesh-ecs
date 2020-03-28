#!/bin/bash

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null && pwd )"

# $1=<CA name>
generate_ca() {
  openssl genrsa -out $DIR/$1_key.pem 2048
  openssl req -new -key $DIR/$1_key.pem -out $DIR/$1_cert.csr -config $DIR/$1_cert.cfg -batch -sha256
  openssl x509 -req -days 3650 -in $DIR/$1_cert.csr -signkey $DIR/$1_key.pem -out $DIR/$1_cert.pem \
    -extensions v3_ca -extfile $DIR/$1_cert.cfg
}

# $1=<certificate name>
generate_rsa_key() {
  openssl genrsa -out $DIR/$1_key.pem 2048
}

# $1=<certificate name> $2=<CA name>
generate_x509_cert() {
  openssl req -new -key $DIR/$1_key.pem -out $DIR/$1_cert.csr -config $DIR/$1_cert.cfg -batch -sha256
  openssl x509 -req -days 3650 -in $DIR/$1_cert.csr -sha256 -CA $DIR/$2_cert.pem -CAkey \
    $DIR/$2_key.pem -CAcreateserial -out $DIR/$1_cert.pem -extensions v3_ca -extfile $DIR/$1_cert.cfg
}

# $1=<certificate name> $2=<CA name>
generate_cert_chain() {
  cat $DIR/$1_cert.pem $DIR/$2_cert.pem > $DIR/$1_cert_chain.pem
}

# Generate cert for the CA.
echo "Generating CA certificates."
generate_ca ca_backend

# Generate RSA cert for the white color teller.
echo "Generating backend certificate."
generate_rsa_key backend ca_backend
generate_x509_cert backend ca_backend
generate_cert_chain backend ca_backend

rm $DIR/*.csr
rm $DIR/*.srl