"""Tests for the router-level path-id validation retrofit (WP7 follow-up
(a), coordinator directive 2026-09-24): ``deps.validate_request_path_ids``
is wired onto every route in networks.py/devices.py/eeros.py/profiles.py
via each module's ``APIRouter(dependencies=[...])``.

A malformed ``{network_id}``/``{eero_id}``/``{profile_id}``/``{device_id}``
must never reach an SDK call, on a representative route per file, for each
of the three payload shapes called out in the task:

- a bare newline (delivered URL-encoded as ``%0A``) - rejected by
  ``validate_request_path_ids`` itself, 400.
- a directory-traversal ``..`` *substring* embedded in an otherwise
  ordinary-looking id - also rejected by the dependency, 400. (A bare
  ``..`` path segment on its own is normalized away by the HTTP client
  before the request is even sent, per RFC 3986 dot-segment removal, so it
  never reaches the server as a distinct case from the collapsed path -
  this is exercised instead with ``..`` embedded inside a longer id.)
- an embedded ``/`` (delivered URL-encoded as ``%2F``) - Starlette's
  default path-parameter converter never matches a decoded ``/`` within a
  single ``{param}`` segment, so this is rejected at the routing layer
  itself (404) before ``validate_request_path_ids`` ever runs. Still
  asserted here (as 404 + "SDK never called") because it is exactly the
  outcome the task cares about: the value never reaches the SDK.
"""

from urllib.parse import quote


class TestNetworkIdValidation:
    async def test_newline_rejected(self, auth_client, authenticated_client):
        response = await auth_client.get(f"/api/networks/{quote('net%0A1', safe='')}")
        assert response.status_code == 400
        authenticated_client.get_network.assert_not_called()

    async def test_embedded_dotdot_rejected(self, auth_client, authenticated_client):
        response = await auth_client.get(f"/api/networks/{quote('net..1', safe='')}")
        assert response.status_code == 400
        authenticated_client.get_network.assert_not_called()

    async def test_embedded_slash_never_reaches_the_sdk(
        self, auth_client, authenticated_client
    ):
        response = await auth_client.get(f"/api/networks/{quote('a/b', safe='')}")
        assert response.status_code == 404
        authenticated_client.get_network.assert_not_called()

    async def test_valid_id_reaches_the_sdk(self, auth_client, authenticated_client):
        authenticated_client.get_network.assert_not_called()
        await auth_client.get("/api/networks/net-1")
        authenticated_client.get_network.assert_called_once()


class TestDeviceIdValidation:
    async def test_newline_rejected(self, auth_client, authenticated_client):
        response = await auth_client.get(f"/api/devices/{quote('dev%0A1', safe='')}")
        assert response.status_code == 400
        authenticated_client.get_device.assert_not_called()

    async def test_embedded_dotdot_rejected(self, auth_client, authenticated_client):
        response = await auth_client.get(f"/api/devices/{quote('dev..1', safe='')}")
        assert response.status_code == 400
        authenticated_client.get_device.assert_not_called()

    async def test_embedded_slash_never_reaches_the_sdk(
        self, auth_client, authenticated_client
    ):
        response = await auth_client.get(f"/api/devices/{quote('a/b', safe='')}")
        assert response.status_code == 404
        authenticated_client.get_device.assert_not_called()


class TestEeroIdValidation:
    async def test_newline_rejected(self, auth_client, authenticated_client):
        response = await auth_client.get(f"/api/eeros/{quote('eero%0A1', safe='')}")
        assert response.status_code == 400
        authenticated_client.get_eero.assert_not_called()

    async def test_embedded_dotdot_rejected(self, auth_client, authenticated_client):
        response = await auth_client.get(f"/api/eeros/{quote('eero..1', safe='')}")
        assert response.status_code == 400
        authenticated_client.get_eero.assert_not_called()

    async def test_embedded_slash_never_reaches_the_sdk(
        self, auth_client, authenticated_client
    ):
        response = await auth_client.get(f"/api/eeros/{quote('a/b', safe='')}")
        assert response.status_code == 404
        authenticated_client.get_eero.assert_not_called()


class TestProfileIdValidation:
    async def test_newline_rejected(self, auth_client, authenticated_client):
        response = await auth_client.get(f"/api/profiles/{quote('prof%0A1', safe='')}")
        assert response.status_code == 400
        authenticated_client.get_profile.assert_not_called()

    async def test_embedded_dotdot_rejected(self, auth_client, authenticated_client):
        response = await auth_client.get(f"/api/profiles/{quote('prof..1', safe='')}")
        assert response.status_code == 400
        authenticated_client.get_profile.assert_not_called()

    async def test_embedded_slash_never_reaches_the_sdk(
        self, auth_client, authenticated_client
    ):
        response = await auth_client.get(f"/api/profiles/{quote('a/b', safe='')}")
        assert response.status_code == 404
        authenticated_client.get_profile.assert_not_called()
