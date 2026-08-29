import { cardsFromQuizletTerms, normalizeQuizletShareUrl } from '../../lib/quizletImport';
import { edgeErrorMessage, functionUrl, type EdgeConfig } from '../edgeConfig';
import { QuizletImportError, type ImportedQuizletSet, type QuizletImporter } from './types';

/**
 * Reads a shared Quizlet set by asking our own server to fetch it.
 *
 * It cannot be done from the app. Quizlet sends no CORS headers, so a browser
 * request is refused before it is made; and set pages sit behind PerimeterX,
 * which answers a plain request with a CAPTCHA page rather than the set. A
 * share link's `i`/`x` pair is what gets a request through, which is why only
 * that kind of link is accepted.
 *
 * Only the fetching happens server-side. What comes back is the raw pairs the
 * page held, and {@link cardsFromQuizletTerms} — core, so both apps agree —
 * decides which of them are cards.
 *
 * Costs no upload. Nothing is generated: an imported set is already written,
 * and the allowance exists to meter the model.
 */
export class EdgeQuizletImporter implements QuizletImporter {
  readonly id = 'edge-quizlet';

  constructor(private readonly config: EdgeConfig) {}

  async importSet(url: string, signal?: AbortSignal): Promise<ImportedQuizletSet> {
    const shareUrl = normalizeQuizletShareUrl(url);
    // Caught here rather than at the far end: the fix is something the person
    // has to go and do in Quizlet, so saying so straight away saves a
    // round trip that was always going to be refused.
    if (!shareUrl) {
      throw new QuizletImportError(
        'That is not a Quizlet share link. Open the set, use Share, copy the link it gives you, and paste that.',
      );
    }

    const token = await this.config.getAccessToken();
    if (!token) throw new QuizletImportError('Sign in to import a set.');

    let response: Response;
    try {
      response = await fetch(functionUrl(this.config, 'import-quizlet'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.config.anonKey,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url: shareUrl }),
        ...(signal ? { signal } : {}),
      });
    } catch {
      throw new QuizletImportError('Could not reach the set. Check your connection and try again.');
    }

    const envelope = (await readJson(response)) as { set?: { title?: unknown; terms?: unknown } } | undefined;

    if (!response.ok) {
      // The function writes its refusals for the person reading them — a
      // private set, a link Quizlet turned away — so they pass through as-is.
      throw new QuizletImportError(
        edgeErrorMessage(envelope, 'Could not read that set. Try again in a moment.'),
      );
    }

    const cards = cardsFromQuizletTerms(envelope?.set?.terms);
    if (cards.length === 0) {
      throw new QuizletImportError(
        'No cards came back from that set. If it is images rather than text, there is nothing to import.',
      );
    }

    const title = typeof envelope?.set?.title === 'string' ? envelope.set.title.trim() : '';
    return { cards, ...(title ? { title } : {}) };
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
