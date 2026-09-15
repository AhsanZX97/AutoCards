import { parseFlashcardText } from '@autocards/core';
import { cn } from '../lib/cn';

interface FlashcardTextProps {
  text: string;
  className?: string;
}

/** Renders saved card text while preserving paragraphs and list semantics. */
export function FlashcardText({ text, className }: FlashcardTextProps) {
  const blocks = parseFlashcardText(text);

  return (
    <div className={cn('w-full break-words', className)}>
      {blocks.map((block, index) => {
        if (block.kind === 'paragraph') {
          return (
            <p key={index} className={cn(index > 0 && 'mt-3', 'whitespace-pre-wrap')}>
              {block.text}
            </p>
          );
        }

        const List = block.kind === 'unordered-list' ? 'ul' : 'ol';
        return (
          <List
            key={index}
            className={cn(
              index > 0 && 'mt-3',
              'space-y-1 pl-5 text-left',
              block.kind === 'unordered-list' ? 'list-disc' : 'list-decimal',
            )}
          >
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex} className="whitespace-pre-wrap">
                {item}
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
