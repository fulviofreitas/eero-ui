"""Live WAN totals must not confuse absent counters or link rates with usage."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from eero.exceptions import EeroAPIException, EeroAuthenticationException

from app.services.wan import aggregate_wan_usage, prepare_wan_sample


def device(down=3.5, up=0.25, **extra):
    return {"connected": True, "usage": {"down_mbps": down, "up_mbps": up}, **extra}


def test_sums_clients_once_ignoring_disconnected_usage_and_link_rates():
    first = device(mac="AA:BB")
    assert aggregate_wan_usage(
        [
            first,
            device(mac="aa:bb"),
            device(6.5, 0.75, mac="CC:DD", connectivity={"rx_bitrate": "1000 Mbit/s"}),
            device(900, 800, connected=False),
        ]
    ) == (10, 1)


@pytest.mark.parametrize(
    "devices", [[], [device(0, 0)], [device(20, 10, connected=False)]]
)
def test_true_idle_totals_are_zero(devices):
    assert aggregate_wan_usage(devices) == (0, 0)


@pytest.mark.parametrize("bad", [None, "2", True, -1, float("nan"), float("inf")])
@pytest.mark.parametrize("direction", ["down_mbps", "up_mbps"])
def test_partial_invalid_totals_are_unknown(bad, direction):
    second = device()
    second["usage"][direction] = bad
    assert aggregate_wan_usage([device(), second]) is None


@pytest.mark.parametrize("usage", [None, {}, "unsupported"])
def test_missing_usage_is_not_zero(usage):
    assert aggregate_wan_usage([device(usage=usage)]) is None


async def test_requests_report_with_existing_sdk_auth_and_waits(monkeypatch):
    auth = SimpleNamespace(get_auth_token=AsyncMock(return_value="existing-token"))
    networks = SimpleNamespace(
        post=AsyncMock(
            return_value={"meta": {"code": 200}, "data": {"next_burst": "later"}}
        )
    )
    sleep = AsyncMock()
    monkeypatch.setattr("app.services.wan.asyncio.sleep", sleep)
    await prepare_wan_sample(
        SimpleNamespace(_api=SimpleNamespace(auth=auth, networks=networks)), "net-1"
    )
    networks.post.assert_awaited_once_with(
        "networks/net-1/burst_reporters", auth_token="existing-token"
    )
    sleep.assert_awaited_once_with(12)


@pytest.mark.parametrize("authenticated", [True, False])
async def test_no_ack_or_auth_does_not_claim_a_fresh_sample(monkeypatch, authenticated):
    auth = SimpleNamespace(
        get_auth_token=AsyncMock(return_value="token" if authenticated else None)
    )
    networks = SimpleNamespace(post=AsyncMock(return_value={"data": {}}))
    sleep = AsyncMock()
    monkeypatch.setattr("app.services.wan.asyncio.sleep", sleep)
    with pytest.raises(
        EeroAPIException if authenticated else EeroAuthenticationException
    ):
        await prepare_wan_sample(
            SimpleNamespace(_api=SimpleNamespace(auth=auth, networks=networks)), "net-1"
        )
    sleep.assert_not_awaited()
