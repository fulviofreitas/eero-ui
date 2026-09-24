"""Tests for account profile writes (phase-6.0-revamp.md WP7, family 9)."""

from unittest.mock import AsyncMock

import pytest

from app.routes.auth import limiter


def make_raw_response(data, code: int = 200):
    return {"meta": {"code": code}, "data": data}


@pytest.fixture(autouse=True)
def _reset_limiter():
    limiter.reset()
    yield
    limiter.reset()


class TestSetAccountName:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.set_account_name = AsyncMock()

        response = await auth_client.put("/api/account/name", json={"name": "Alice"})

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.set_account_name.assert_not_called()

    async def test_valid_name_calls_sdk(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_account_name = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put("/api/account/name", json={"name": "Alice"})

        assert response.status_code == 200
        assert response.json() == {"success": True}
        authenticated_client.set_account_name.assert_called_once_with("Alice")

    async def test_empty_name_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_account_name = AsyncMock()

        response = await auth_client.put("/api/account/name", json={"name": "   "})

        assert response.status_code == 422
        authenticated_client.set_account_name.assert_not_called()


class TestSetAccountEmail:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.set_account_email = AsyncMock()

        response = await auth_client.put(
            "/api/account/email", json={"email": "a@example.com"}
        )

        assert response.status_code == 403
        authenticated_client.set_account_email.assert_not_called()

    async def test_valid_email_calls_sdk(
        self,
        auth_client,
        authenticated_client,
        experimental_writes_enabled,
        account_identity_writes_enabled,
    ):
        authenticated_client.set_account_email = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/account/email", json={"email": "a@example.com"}
        )

        assert response.status_code == 200
        authenticated_client.set_account_email.assert_called_once_with("a@example.com")

    async def test_invalid_email_rejected(
        self,
        auth_client,
        authenticated_client,
        experimental_writes_enabled,
        account_identity_writes_enabled,
    ):
        authenticated_client.set_account_email = AsyncMock()

        response = await auth_client.put(
            "/api/account/email", json={"email": "not-an-email"}
        )

        assert response.status_code == 422
        authenticated_client.set_account_email.assert_not_called()


class TestVerifyAccountEmail:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.verify_account_email = AsyncMock()

        response = await auth_client.post(
            "/api/account/email/verify", json={"code": "1234"}
        )

        assert response.status_code == 403
        authenticated_client.verify_account_email.assert_not_called()

    async def test_valid_code_calls_sdk(
        self,
        auth_client,
        authenticated_client,
        experimental_writes_enabled,
        account_identity_writes_enabled,
    ):
        authenticated_client.verify_account_email = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.post(
            "/api/account/email/verify", json={"code": "123456"}
        )

        assert response.status_code == 200
        authenticated_client.verify_account_email.assert_called_once_with("123456")

    async def test_non_numeric_code_rejected(
        self,
        auth_client,
        authenticated_client,
        experimental_writes_enabled,
        account_identity_writes_enabled,
    ):
        authenticated_client.verify_account_email = AsyncMock()

        response = await auth_client.post(
            "/api/account/email/verify", json={"code": "abcdef"}
        )

        assert response.status_code == 422
        authenticated_client.verify_account_email.assert_not_called()

    async def test_response_never_contains_the_code(
        self,
        auth_client,
        authenticated_client,
        experimental_writes_enabled,
        account_identity_writes_enabled,
    ):
        authenticated_client.verify_account_email = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.post(
            "/api/account/email/verify", json={"code": "998877"}
        )

        assert "998877" not in response.text


class TestSetAccountPhone:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.set_account_phone = AsyncMock()

        response = await auth_client.put(
            "/api/account/phone", json={"phone": "+15551234567"}
        )

        assert response.status_code == 403
        authenticated_client.set_account_phone.assert_not_called()

    async def test_valid_phone_calls_sdk(
        self,
        auth_client,
        authenticated_client,
        experimental_writes_enabled,
        account_identity_writes_enabled,
    ):
        authenticated_client.set_account_phone = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/account/phone", json={"phone": "+15551234567"}
        )

        assert response.status_code == 200
        authenticated_client.set_account_phone.assert_called_once_with("+15551234567")

    async def test_invalid_phone_rejected(
        self,
        auth_client,
        authenticated_client,
        experimental_writes_enabled,
        account_identity_writes_enabled,
    ):
        authenticated_client.set_account_phone = AsyncMock()

        response = await auth_client.put(
            "/api/account/phone", json={"phone": "call-me-maybe"}
        )

        assert response.status_code == 422
        authenticated_client.set_account_phone.assert_not_called()


class TestVerifyAccountPhone:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.verify_account_phone = AsyncMock()

        response = await auth_client.post(
            "/api/account/phone/verify", json={"code": "1234"}
        )

        assert response.status_code == 403
        authenticated_client.verify_account_phone.assert_not_called()

    async def test_valid_code_calls_sdk(
        self,
        auth_client,
        authenticated_client,
        experimental_writes_enabled,
        account_identity_writes_enabled,
    ):
        authenticated_client.verify_account_phone = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.post(
            "/api/account/phone/verify", json={"code": "1234"}
        )

        assert response.status_code == 200
        authenticated_client.verify_account_phone.assert_called_once_with("1234")


class TestSetAccountConsents:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.set_account_consents = AsyncMock()

        response = await auth_client.put(
            "/api/account/consents", json={"marketing_emails": False}
        )

        assert response.status_code == 403
        authenticated_client.set_account_consents.assert_not_called()

    async def test_sets_consent(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_account_consents = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/account/consents", json={"marketing_emails": True}
        )

        assert response.status_code == 200
        authenticated_client.set_account_consents.assert_called_once_with(
            marketing_emails=True
        )


class TestAccountWritesRateLimit:
    async def test_eleventh_write_within_a_minute_is_rate_limited(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_account_name = AsyncMock(
            return_value=make_raw_response({})
        )

        last_status = None
        for _ in range(11):
            response = await auth_client.put(
                "/api/account/name", json={"name": "Alice"}
            )
            last_status = response.status_code

        assert last_status == 429


class TestGetSmsCountries:
    async def test_returns_countries_not_gated(self, auth_client, authenticated_client):
        authenticated_client.get_sms_countries = AsyncMock(
            return_value=make_raw_response({"countries": [{"code": "US"}]})
        )

        response = await auth_client.get("/api/account/sms-countries")

        assert response.status_code == 200
        assert response.json() == {"countries": [{"code": "US"}]}
