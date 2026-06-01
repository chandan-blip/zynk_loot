-- Migration: Payment-gateway bridge over OkPay.
--   gateway_merchants — client domains we front (we issue api_key/api_secret,
--     proxy their payments to our single OkPay account, and optionally give them
--     a self-serve portal on their own subdomain).
--   gateway_orders — one row per payment created on OkPay on a merchant's behalf;
--     bridge_unique_id is the globally-unique ref we send OkPay so an inbound
--     callback can be routed back to the right merchant.

CREATE TABLE IF NOT EXISTS gateway_merchants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    domain VARCHAR(255) DEFAULT NULL,
    api_key VARCHAR(64) NOT NULL,
    api_secret VARCHAR(128) NOT NULL,
    callback_url VARCHAR(512) DEFAULT NULL,
    currency VARCHAR(16) NOT NULL DEFAULT 'USDT',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    portal_subdomain VARCHAR(63) DEFAULT NULL,
    portal_username VARCHAR(64) DEFAULT NULL,
    portal_password_hash VARCHAR(255) DEFAULT NULL,
    portal_enabled TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_api_key (api_key),
    UNIQUE KEY uniq_portal_subdomain (portal_subdomain),
    UNIQUE KEY uniq_portal_username (portal_username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gateway_orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    merchant_id INT NOT NULL,
    bridge_unique_id VARCHAR(80) NOT NULL,
    client_unique_id VARCHAR(190) DEFAULT NULL,
    okpay_order_id VARCHAR(190) DEFAULT NULL,
    amount DECIMAL(20, 8) NOT NULL DEFAULT 0,
    coin VARCHAR(16) DEFAULT NULL,
    status TINYINT NOT NULL DEFAULT 0,
    type VARCHAR(16) NOT NULL DEFAULT 'deposit',
    return_url VARCHAR(512) DEFAULT NULL,
    client_callback_url VARCHAR(512) DEFAULT NULL,
    pay_url VARCHAR(512) DEFAULT NULL,
    raw_callback TEXT DEFAULT NULL,
    forwarded TINYINT(1) NOT NULL DEFAULT 0,
    forward_attempts INT NOT NULL DEFAULT 0,
    last_forward_code INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_bridge_unique_id (bridge_unique_id),
    INDEX idx_merchant (merchant_id),
    INDEX idx_merchant_client (merchant_id, client_unique_id),
    CONSTRAINT fk_gateway_orders_merchant
        FOREIGN KEY (merchant_id) REFERENCES gateway_merchants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
