# CHANGELOG

## 19.0.0

Breaking changes:
  * A [`bookend`][https://github.com/screwdriver-cd/build-bookend] is now required for `BuildFactory` configuration.

## 18.0.0

Breaking changes:
  * Scm plugins need to have `getCheckoutCommand` implemented.

Features:
  * Add `sd-checkout-code` step to `steps` of build object.

## 17.1.0

Features:
  * Add `command` to `steps` and `environment` to build object.

## 17.0.0

Features:
  * Add event model.
  * Add getEvents for pipeline.
