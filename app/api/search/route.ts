import { NextResponse } from 'next/server';
import { KOREAN_BOOK_ABBREVIATIONS } from '@/lib/bookAbbreviations';
import { ENGLISH_BOOK_ABBREVIATIONS } from '@/lib/enBookAbbreviations'; 
import { KOREAN_TO_ENGLISH_BOOK_MAP } from '@/lib/bookMapping';
import { OLD_TESTAMENT_BOOKS, NEW_TESTAMENT_BOOKS } from '@/lib/books'; 
import KoreanBibleData from '@/lib/ko_krv_bible.json';
import EnglishBibleData from '@/lib/en_kjv_bible.json';

export const runtime = 'edge';

interface SearchResult {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

interface ParsedVerseReference {
  book: string;
  chapter: number;
  verse?: number;
}

const KoreanBible: { [key: string]: string } = KoreanBibleData;
const EnglishBible: { [key: string]: string } = EnglishBibleData;

function getKoreanBookName(input: string): string | null {
  const normalizedInput = input.replace(/\s/g, '');
  for (const bookName of [...OLD_TESTAMENT_BOOKS, ...NEW_TESTAMENT_BOOKS]) {
    if (bookName.replace(/\s/g, '') === normalizedInput) {
      return bookName;
    }
  }
  for (const fullBookName in KOREAN_BOOK_ABBREVIATIONS) {
    if (KOREAN_BOOK_ABBREVIATIONS[fullBookName].replace(/\s/g, '') === normalizedInput) {
      return fullBookName;
    }
  }
  return null;
}

function getEnglishBookName(input: string): string | null {
  const normalizedInput = input.replace(/\s/g, '').toLowerCase();
  const englishBookFullNames = Object.values(KOREAN_TO_ENGLISH_BOOK_MAP);
  for (const bookName of englishBookFullNames) {
    if (bookName.replace(/\s/g, '').toLowerCase() === normalizedInput) {
      return bookName;
    }
  }
  for (const key in ENGLISH_BOOK_ABBREVIATIONS) {
    if (key.replace(/\s/g, '').toLowerCase() === normalizedInput) {
      const mappedValue = ENGLISH_BOOK_ABBREVIATIONS[key];
      if (englishBookFullNames.includes(mappedValue)) {
        return mappedValue;
      }
      return key;
    }
  }
  return null;
}

function parseVerseReference(query: string, lang: string): ParsedVerseReference | null {
  let match;
  if (lang === 'ko') {
    match = query.match(/(\S+?)\s*(\d+)(?:장|:)\s*(?:(\d+)\s*절)?/);
  } else {
    match = query.match(/(\S+(?:\s\S+)*?)\s*(\d+):?(\d+)?/i);
  }

  if (match) {
    let bookNamePart = match[1].trim();
    const chapter = parseInt(match[2], 10);
    const verse = match[3] ? parseInt(match[3], 10) : undefined;
    let fullBookName: string | null = null;
    if (lang === 'ko') {
      fullBookName = getKoreanBookName(bookNamePart);
    } else {
      fullBookName = getEnglishBookName(bookNamePart);
    }
    if (fullBookName) {
      return { book: fullBookName, chapter, verse };
    }
  }

  let fullBookName: string | null = null;
  const trimmedQuery = query.trim();
  if (lang === 'ko') {
    fullBookName = getKoreanBookName(trimmedQuery);
  } else {
    fullBookName = getEnglishBookName(trimmedQuery);
  }

  if (fullBookName) {
    return { book: fullBookName, chapter: 1 };
  }

  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const lang = searchParams.get('lang');

  if (!query || !lang) {
    return NextResponse.json({ error: 'Missing query or language parameter' }, { status: 400 });
  }

  const isKorean = lang === 'ko';
  const bibleData = isKorean ? KoreanBible : EnglishBible;
  const allBooks = [...OLD_TESTAMENT_BOOKS, ...NEW_TESTAMENT_BOOKS];

  try {
    const parsedRef = parseVerseReference(query, lang);
    if (parsedRef && parsedRef.book && parsedRef.chapter) {
      return NextResponse.json({ type: 'verse_navigation', ...parsedRef });
    } else {
      const results: SearchResult[] = [];
      const lowerCaseQuery = query.toLowerCase();
      for (const key in bibleData) {
        const text = bibleData[key];
        if (text.toLowerCase().includes(lowerCaseQuery)) {
          let bookRef, chapterRef, verseRef;
          if (isKorean) {
            const match = key.match(/(\S+?)(\d+):(\d+)/);
            if (match) {
              const abbr = match[1];
              bookRef = allBooks.find(b => KOREAN_BOOK_ABBREVIATIONS[b] === abbr) || abbr;
              chapterRef = parseInt(match[2], 10);
              verseRef = parseInt(match[3], 10);
            }
          } else {
            const match = key.match(/([A-Za-z\s\d]+?)\s*(\d+):(\d+)/);
            if (match) {
              bookRef = match[1].trim();
              chapterRef = parseInt(match[2], 10);
              verseRef = parseInt(match[3], 10);
            }
          }
          if (bookRef && chapterRef && verseRef) {
            results.push({ book: bookRef, chapter: chapterRef, verse: verseRef, text });
          }
        }
      }
      return NextResponse.json({ type: 'keyword_results', results: results.slice(0, 100) });
    }
  } catch (err: any) {
    console.error('Search API Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
