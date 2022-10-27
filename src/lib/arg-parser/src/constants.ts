export const optionStrPredicate = {
  isAlias: (s: string) => /^-([^\d-])$/.test(s),
  isLong: (s: string) => /^--(\S)[^=]+$/.test(s),
  isCombinedShort: (s: string) => /^-[^\d-]{2,}$/.test(s),

  // Targets those options in the format '--long=value'
  containsValue: (s: string) => /^(--\S+?)=(.*)/.test(s),
};

export const FLAG_PLACEHOLDER_VALUE = 'TRUE';
