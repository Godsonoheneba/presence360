type Handler = () => void;

const unauthorizedHandlers = new Set<Handler>();

export const authEvents = {
  onUnauthorized(handler: Handler) {
    unauthorizedHandlers.add(handler);
    return () => {
      unauthorizedHandlers.delete(handler);
    };
  },
  emitUnauthorized() {
    unauthorizedHandlers.forEach((handler) => handler());
  },
};
