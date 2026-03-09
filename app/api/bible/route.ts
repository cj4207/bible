import { NextResponse } from 'next/server';
import { KOREAN_BOOK_ABBREVIATIONS } from '@/lib/bookAbbreviations';
import { KOREAN_TO_ENGLISH_BOOK_MAP } from '@/lib/bookMapping';
import { OLD_TESTAMENT_BOOKS, NEW_TESTAMENT_BOOKS } from '@/lib/books'; 
import KoreanBibleData from '@/lib/ko_krv_bible.json';
import EnglishBibleData from '@/lib/en_kjv_bible.json';

export const runtime = 'edge';

interface StandardizedVerse {
  verse: number;
  text: string;
}

const KoreanBible: { [key: string]: string } = KoreanBibleData;
const EnglishBible: { [key: string]: string } = EnglishBibleData;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lang = searchParams.get('lang');
  const book = searchParams.get('book');
  const chapter = searchParams.get('chapter');

  if (!lang || !book || !chapter) {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
  }

  try {
    let fetchedVerses: StandardizedVerse[] = [];

    if (lang === 'ko') {
      const bookAbbr = KOREAN_BOOK_ABBREVIATIONS[book];
      if (!bookAbbr) {
        return NextResponse.json({ error: 'Invalid Korean book name' }, { status: 400 });
      }
      
      const keyPrefix = `${bookAbbr}${chapter}:`;
      
      fetchedVerses = Object.keys(KoreanBible)
        .filter(key => key.startsWith(keyPrefix))
        .map(key => {
          const verseNumber = parseInt(key.split(':')[1], 10);
          return {
            verse: verseNumber,
            text: KoreanBible[key],
          };
        })
        .sort((a, b) => a.verse - b.verse);

      if (fetchedVerses.length === 0) {
        return NextResponse.json({ error: `Chapter ${chapter} not found for ${book}` }, { status: 404 });
      }

    } else if (lang === 'en') {
      const bookInEnglish = KOREAN_TO_ENGLISH_BOOK_MAP[book];
      if (!bookInEnglish) {
        return NextResponse.json({ error: 'Invalid English book name mapping' }, { status: 400 });
      }

      const keyPrefix = `${bookInEnglish} ${chapter}:`;
      
      fetchedVerses = Object.keys(EnglishBible)
        .filter(key => key.startsWith(keyPrefix))
        .map(key => {
          const verseMatch = key.match(/:(\d+)$/);
          const verseNumber = verseMatch ? parseInt(verseMatch[1], 10) : 0;
          return {
            verse: verseNumber,
            text: EnglishBible[key],
          };
        })
        .sort((a, b) => a.verse - b.verse);

      if (fetchedVerses.length === 0) {
        return NextResponse.json({ error: `Chapter ${chapter} not found for ${bookInEnglish}` }, { status: 404 });
      }

    } else {
      return NextResponse.json({ error: 'Invalid language specified' }, { status: 400 });
    }

    return NextResponse.json(fetchedVerses);

  } catch (err: any) {
    console.error('API Route Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
