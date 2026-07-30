"""Fire-and-forget calls to the shared alert-relay service (see
aswinkunju/infra-server apps/alert-relay/). Never allowed to fail the request that
triggered it — a relay outage should never take signup down with it.
"""

import logging

import httpx

from app.config import Settings

logger = logging.getLogger("app.alerts")


async def send_signup_alert(client: httpx.AsyncClient, settings: Settings, email: str) -> None:
    if not settings.alert_relay_url:
        return
    try:
        resp = await client.post(
            f"{settings.alert_relay_url.rstrip('/')}/alert",
            json={"app": "api-mgmt-dashboard", "event": "user.signup", "message": f"New signup: {email}"},
            headers={"Authorization": f"Bearer {settings.alert_relay_api_key}"},
            timeout=5.0,
        )
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("signup alert failed to reach alert-relay: %s", exc)
