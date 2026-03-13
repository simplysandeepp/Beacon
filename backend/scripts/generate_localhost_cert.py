from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
import ipaddress

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from cryptography.x509.oid import ExtendedKeyUsageOID


ROOT = Path(__file__).resolve().parents[1]
CERT_DIR = ROOT / ".certs"
CA_CERT_PATH = CERT_DIR / "beacon-local-ca.pem"
CA_KEY_PATH = CERT_DIR / "beacon-local-ca-key.pem"
CERT_PATH = CERT_DIR / "localhost.pem"
KEY_PATH = CERT_DIR / "localhost-key.pem"
META_PATH = CERT_DIR / "localhost.json"


def main() -> None:
    CERT_DIR.mkdir(parents=True, exist_ok=True)

    ca_private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    ca_subject = x509.Name(
        [
            x509.NameAttribute(NameOID.COUNTRY_NAME, "US"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Beacon Local Dev"),
            x509.NameAttribute(NameOID.COMMON_NAME, "Beacon Local Dev Root CA"),
        ]
    )

    ca_certificate = (
        x509.CertificateBuilder()
        .subject_name(ca_subject)
        .issuer_name(ca_subject)
        .public_key(ca_private_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.now(timezone.utc) - timedelta(minutes=5))
        .not_valid_after(datetime.now(timezone.utc) + timedelta(days=365))
        .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                content_commitment=False,
                key_encipherment=False,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=True,
                crl_sign=True,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
        .add_extension(
            x509.SubjectKeyIdentifier.from_public_key(ca_private_key.public_key()),
            critical=False,
        )
        .add_extension(
            x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_private_key.public_key()),
            critical=False,
        )
        .sign(ca_private_key, hashes.SHA256())
    )

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = x509.Name(
        [
            x509.NameAttribute(NameOID.COUNTRY_NAME, "US"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Beacon Local Dev"),
            x509.NameAttribute(NameOID.COMMON_NAME, "localhost"),
        ]
    )
    certificate = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(ca_subject)
        .public_key(private_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.now(timezone.utc) - timedelta(minutes=5))
        .not_valid_after(datetime.now(timezone.utc) + timedelta(days=30))
        .add_extension(
            x509.SubjectAlternativeName(
                [
                    x509.DNSName("localhost"),
                    x509.IPAddress(ipaddress.ip_address("127.0.0.1")),
                    x509.IPAddress(ipaddress.ip_address("::1")),
                ]
            ),
            critical=False,
        )
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                content_commitment=False,
                key_encipherment=True,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=False,
                crl_sign=False,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
        .add_extension(
            x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]),
            critical=False,
        )
        .add_extension(
            x509.SubjectKeyIdentifier.from_public_key(private_key.public_key()),
            critical=False,
        )
        .add_extension(
            x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_private_key.public_key()),
            critical=False,
        )
        .sign(ca_private_key, hashes.SHA256())
    )

    ca_cert_pem = ca_certificate.public_bytes(serialization.Encoding.PEM)
    ca_key_pem = ca_private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    )
    cert_pem = certificate.public_bytes(serialization.Encoding.PEM)
    key_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    )

    CA_CERT_PATH.write_bytes(ca_cert_pem)
    CA_KEY_PATH.write_bytes(ca_key_pem)
    CERT_PATH.write_bytes(cert_pem)
    KEY_PATH.write_bytes(key_pem)

    thumbprint = hashlib.sha1(ca_certificate.public_bytes(serialization.Encoding.DER)).hexdigest().upper()
    META_PATH.write_text(
        json.dumps(
            {
                "thumbprint": thumbprint,
                "ca_cert_path": str(CA_CERT_PATH),
                "ca_key_path": str(CA_KEY_PATH),
                "cert_path": str(CERT_PATH),
                "key_path": str(KEY_PATH),
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    print(str(CERT_PATH))
    print(thumbprint)


if __name__ == "__main__":
    main()