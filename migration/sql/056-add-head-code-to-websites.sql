-- Migration: Allow custom <head> code (meta tags, scripts, pixels) per website

ALTER TABLE websites
    ADD COLUMN head_code LONGTEXT NULL AFTER js;
