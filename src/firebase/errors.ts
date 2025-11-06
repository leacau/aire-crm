
export type SecurityRuleContext = {
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete' | 'write';
  requestResourceData?: any;
};

// A custom error class that will hold our rich context.
export class FirestorePermissionError extends Error {
  context: SecurityRuleContext;

  constructor(context: SecurityRuleContext) {
    const message = `Firestore Permission Denied: The following request was denied by security rules. Context: ${JSON.stringify(context, null, 2)}`;
    super(message);
    this.name = 'FirestorePermissionError';
    this.context = context;
    
    // This is necessary for custom errors in some JS environments.
    Object.setPrototypeOf(this, FirestorePermissionError.prototype);
  }
}
