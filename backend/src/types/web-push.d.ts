// web-push 3.6.7 ships no types and @types/web-push is not installed (#260), so only the part
// the app calls is declared here.
declare module 'web-push' {
  export type PushSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };
  export type SendOptions = {
    vapidDetails?: { subject: string; publicKey: string; privateKey: string };
    TTL?: number;
    urgency?: 'very-low' | 'low' | 'normal' | 'high';
    topic?: string;
  };
  const webpush: {
    sendNotification(
      subscription: PushSubscription,
      payload: string,
      options?: SendOptions,
    ): Promise<{ statusCode: number }>;
  };
  // The CommonJS module is imported as a default in ESM, so a named export would not exist at runtime.
  // eslint-disable-next-line no-restricted-syntax
  export default webpush;
}
