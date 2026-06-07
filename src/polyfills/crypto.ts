import * as ExpoCrypto from 'expo-crypto';

// React Native (Hermes) has no global `crypto`, so `uuid`'s v7 generator throws
// "Property 'crypto' doesn't exist" the moment we mint an id. Provide the Web Crypto methods
// uuid needs from expo-crypto (already a native dependency — no extra package/rebuild).
// This module MUST be imported before any uuid usage (see index.ts).

const target = globalThis as unknown as {
  crypto?: { getRandomValues?: unknown; randomUUID?: unknown };
};

if (!target.crypto) {
  target.crypto = {
    getRandomValues: ExpoCrypto.getRandomValues,
    randomUUID: ExpoCrypto.randomUUID,
  };
} else {
  if (typeof target.crypto.getRandomValues !== 'function') {
    target.crypto.getRandomValues = ExpoCrypto.getRandomValues;
  }
  if (typeof target.crypto.randomUUID !== 'function') {
    target.crypto.randomUUID = ExpoCrypto.randomUUID;
  }
}
