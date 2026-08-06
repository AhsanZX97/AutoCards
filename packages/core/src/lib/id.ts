const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

let counter = 0;

/**
 * Short, sortable-enough unique id. Not cryptographically random — ids only
 * need to be unique inside one account's local store.
 */
export function createId(prefix = ''): string {
  counter = (counter + 1) % 1_000_000;
  const time = Date.now().toString(36);
  const seq = counter.toString(36).padStart(4, '0');
  let rand = '';
  for (let i = 0; i < 5; i += 1) {
    rand += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  const id = `${time}${seq}${rand}`;
  return prefix ? `${prefix}_${id}` : id;
}
