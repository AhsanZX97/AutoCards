import { useState } from 'react';
import { Platform } from 'react-native';
import {
  ErrorCode,
  fetchProducts,
  finishTransaction,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  type Purchase,
} from 'expo-iap';
import { PLAY_PRODUCT_IDS, type Plan, type PurchasablePlan } from '@autocards/core';
import { useApp } from './appContext';

let connecting: Promise<boolean> | null = null;

/** Opens the connection to Play Billing once and keeps it open for the app's lifetime. */
function ensureConnected(): Promise<boolean> {
  if (!connecting) connecting = initConnection();
  return connecting;
}

/** A subscription's only base plan has no discount, but Play still requires its offer token to buy it. */
async function offerTokenFor(productId: string): Promise<string> {
  const products = await fetchProducts({ skus: [productId], type: 'subs' });
  const offerToken = products?.[0]?.subscriptionOffers?.[0]?.offerTokenAndroid;
  if (!offerToken) throw new Error('That plan is not on sale yet. Try again shortly.');
  return offerToken;
}

/**
 * Mobile's side of buying Pro or Lifetime — Android only. Apple has no
 * equivalent yet, which is why `WEB_BILLING_URL` in `settings.tsx` still
 * sends iOS to the website; see the comment there.
 *
 * Drives the whole round trip: opens Play's billing sheet, waits for the
 * result on the purchase-updated event — not the promise `requestPurchase`
 * itself returns, which expo-iap's own docs treat as secondary to the
 * listener — then hands the purchase token to `verify-play-purchase`, the
 * only thing that can actually confirm it happened and grant the plan.
 * `finishTransaction` only runs once that confirmation is back, so a purchase
 * Google reports but our own server never verified stays unacknowledged
 * rather than silently granted.
 */
export function useGooglePlayPurchase() {
  const app = useApp();
  const [loading, setLoading] = useState(false);

  async function buy(plan: PurchasablePlan): Promise<Plan | null> {
    if (Platform.OS !== 'android') {
      throw new Error('Google Play purchases are only available on Android.');
    }
    const playBilling = app.services.playBilling;
    if (!playBilling) {
      throw new Error('Purchases are not available right now. Try again in a moment.');
    }

    setLoading(true);
    try {
      await ensureConnected();
      const productId = PLAY_PRODUCT_IDS[plan];

      // Resolves with the completed purchase, null for "the user backed out"
      // (not a failure worth a message), or rejects with one worth showing.
      const purchase = await new Promise<Purchase | null>((resolve, reject) => {
        const updateSub = purchaseUpdatedListener((event) => {
          if (event.productId !== productId) return;
          cleanup();
          resolve(event);
        });
        const errorSub = purchaseErrorListener((error) => {
          cleanup();
          if (error.code === ErrorCode.UserCancelled) {
            resolve(null);
            return;
          }
          reject(new Error(error.message || 'That purchase did not go through.'));
        });
        function cleanup() {
          updateSub.remove();
          errorSub.remove();
        }

        const started =
          plan === 'lifetime'
            ? requestPurchase({ request: { google: { skus: [productId] } }, type: 'in-app' })
            : offerTokenFor(productId).then((offerToken) =>
                requestPurchase({
                  request: {
                    google: { skus: [productId], subscriptionOffers: [{ sku: productId, offerToken }] },
                  },
                  type: 'subs',
                }),
              );
        started.catch((error: unknown) => {
          cleanup();
          reject(error instanceof Error ? error : new Error('That purchase did not go through.'));
        });
      });

      if (!purchase) return null;

      const granted = await playBilling.verifyPurchase({
        productId,
        purchaseToken: purchase.purchaseToken ?? '',
      });
      await finishTransaction({ purchase, isConsumable: false });
      return granted;
    } finally {
      setLoading(false);
    }
  }

  return { buy, loading };
}
