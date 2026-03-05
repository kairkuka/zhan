export type ParsedDateCursor = {
  createdAt: Date;
  id: string | null;
};

export function parseDateIdCursor(cursor: string): ParsedDateCursor | null {
  const separatorIndex = cursor.indexOf('|');

  if (separatorIndex === -1) {
    const createdAt = new Date(cursor);
    if (Number.isNaN(createdAt.getTime())) {
      return null;
    }

    return {
      createdAt,
      id: null,
    };
  }

  if (
    separatorIndex === 0 ||
    separatorIndex === cursor.length - 1 ||
    cursor.indexOf('|', separatorIndex + 1) !== -1
  ) {
    return null;
  }

  const createdAtValue = cursor.slice(0, separatorIndex);
  const id = cursor.slice(separatorIndex + 1);
  const createdAt = new Date(createdAtValue);

  if (Number.isNaN(createdAt.getTime()) || id.length === 0) {
    return null;
  }

  return {
    createdAt,
    id,
  };
}

export function isValidDateIdCursor(cursor: string): boolean {
  return parseDateIdCursor(cursor) !== null;
}

export function encodeDateIdCursor(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}|${id}`;
}
