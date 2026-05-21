export const ease = [0.16, 1, 0.3, 1] as const;

export const pageTransition = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
  transition: { duration: 0.32, ease },
};

export const press = {
  whileTap: { scale: 0.97 },
  transition: { duration: 0.18, ease },
};

export const pressFirm = {
  whileTap: { scale: 0.94 },
  transition: { duration: 0.16, ease },
};
