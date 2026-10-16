"""Helpers for sharing a locally running frontend inside the same LAN."""

from __future__ import annotations

import ipaddress
import socket

from app.config import settings


def _private_ipv4_addresses() -> list[str]:
    addresses: set[str] = set()

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            # UDP connect selects the interface without sending a packet.
            probe.connect(("8.8.8.8", 80))
            addresses.add(probe.getsockname()[0])
    except OSError:
        pass

    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            addresses.add(info[4][0])
    except OSError:
        pass

    private = []
    for address in addresses:
        try:
            parsed = ipaddress.ip_address(address)
        except ValueError:
            continue
        if parsed.is_private and not parsed.is_loopback and not parsed.is_link_local:
            private.append(address)

    def priority(address: str) -> tuple[int, str]:
        if address.startswith("192.168."):
            return (0, address)
        if address.startswith("10."):
            return (1, address)
        return (2, address)

    return sorted(private, key=priority)


def frontend_base_url() -> str | None:
    """Return an explicitly configured or auto-detected LAN frontend URL."""
    configured = settings.app_base_url.strip().rstrip("/")
    if configured:
        return configured
    addresses = _private_ipv4_addresses()
    if not addresses:
        return None
    return f"http://{addresses[0]}:{settings.frontend_port}"
