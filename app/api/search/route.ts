import { NextResponse } from 'next/server';
import { KOREAN_BOOK_ABBREVIATIONS } from '@/lib/bookAbbreviations';
import { ENGLISH_BOOK_ABBREVIATIONS } from '@/lib/enBookAbbreviations'; 
import { KOREAN_TO_ENGLISH_BOOK_MAP } from '@/lib/bookMapping'; // Add this import
import { OLD_TESTAMENT_BOOKS, NEW_TESTAMENT_BOOKS } from '@/lib/books'; 
import KoreanBibleData from '@/lib/ko_krv_bible.json';
import EnglishBibleData from '@/lib/en_kjv_bible.json';

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

// Helper to get book name from abbreviation or full name
function getKoreanBookName(input: string): string | null {
  const normalizedInput = input.replace(/\s/g, ''); // Remove spaces for matching
  
  // Try matching full book names first
  for (const bookName of [...OLD_TESTAMENT_BOOKS, ...NEW_TESTAMENT_BOOKS]) {
    if (bookName.replace(/\s/g, '') === normalizedInput) {
      return bookName;
    }
  }

  // Then try matching abbreviations
  for (const fullBookName in KOREAN_BOOK_ABBREVIATIONS) {
    if (KOREAN_BOOK_ABBREVIATIONS[fullBookName].replace(/\s/g, '') === normalizedInput) {
      return fullBookName;
    }
  }
  return null;
}

function getEnglishBookName(input: string): string | null {
  const normalizedInput = input.replace(/\s/g, '').toLowerCase(); // Lowercase for case-insensitive match
  
  // Try matching full book names from the mapping
  const englishBookFullNames = Object.values(KOREAN_TO_ENGLISH_BOOK_MAP);
  for (const bookName of englishBookFullNames) {
    if (bookName.replace(/\s/g, '').toLowerCase() === normalizedInput) {
      return bookName;
    }
  }

  // Then try matching abbreviations/full names in ENGLISH_BOOK_ABBREVIATIONS
  for (const key in ENGLISH_BOOK_ABBREVIATIONS) {
    if (key.replace(/\s/g, '').toLowerCase() === normalizedInput) {
      const mappedValue = ENGLISH_BOOK_ABBREVIATIONS[key];
      // If the mapped value is an abbreviation (3-4 chars), the key was likely the full name.
      // If the mapped value is a full name, return it.
      // Actually, our ENGLISH_BOOK_ABBREVIATIONS has both directions.
      // Let's find the one that is a full name.
      // A better way: if the value is in englishBookFullNames, it's the full name.
      if (englishBookFullNames.includes(mappedValue)) {
        return mappedValue;
      }
      return key; // Fallback to key itself if it matches the pattern
    }
  }
  return null;
}


// Function to parse a verse reference (e.g., "요 3:16", "John 3:16", or just "요한복음")
function parseVerseReference(query: string, lang: string): ParsedVerseReference | null {
  // Regex to match patterns like "Book Chapter:Verse" or "Book Chapter"
  // Handles Korean (장, 절) and English (:, etc.)
  let match;
  if (lang === 'ko') {
    // 요한복음 3장 16절, 요3:16, 요한복음 3장
    match = query.match(/(\S+?)\s*(\d+)(?:장|:)\s*(?:(\d+)\s*절)?/);
  } else { // 'en'
    // John 3:16, John 3, Jn 3:16
    match = query.match(/(\S+(?:\s\S+)*?)\s*(\d+):?(\d+)?/i);
  }

  if (match) {
    let bookNamePart = match[1].trim();
    const chapter = parseInt(match[2], 10);
    const verse = match[3] ? parseInt(match[3], 10) : undefined;

    let fullBookName: string | null = null;

    if (lang === 'ko') {
      fullBookName = getKoreanBookName(bookNamePart);
    } else { // 'en'
      fullBookName = getEnglishBookName(bookNamePart);
    }
    
    if (fullBookName) {
      return { book: fullBookName, chapter, verse };
    }
  }

  // If no chapter match, check if the query is just a book name
  let fullBookName: string | null = null;
  const trimmedQuery = query.trim();
  
  if (lang === 'ko') {
    fullBookName = getKoreanBookName(trimmedQuery);
  } else {
    fullBookName = getEnglishBookName(trimmedQuery);
  }

  if (fullBookName) {
    // Default to chapter 1 if only book name is provided
    return { book: fullBookName, chapter: 1 };
  }

  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const lang = searchParams.get('lang'); // 'ko' or 'en'

  if (!query || !lang) {
    return NextResponse.json({ error: 'Missing query or language parameter' }, { status: 400 });
  }

  const isKorean = lang === 'ko';
  const bibleData = isKorean ? KoreanBible : EnglishBible;
  const bookAbbrMap = isKorean ? KOREAN_BOOK_ABBREVIATIONS : ENGLISH_BOOK_ABBREVIATIONS;
  const allBooks = [...OLD_TESTAMENT_BOOKS, ...NEW_TESTAMENT_BOOKS];

  try {
    const parsedRef = parseVerseReference(query, lang);

    if (parsedRef && parsedRef.book && parsedRef.chapter) {
      // If it's a verse reference, return navigation info
      return NextResponse.json({ type: 'verse_navigation', ...parsedRef });
    } else {
      // Otherwise, perform keyword search
      const results: SearchResult[] = [];
      const lowerCaseQuery = query.toLowerCase();

      for (const key in bibleData) {
        const text = bibleData[key];
        if (text.toLowerCase().includes(lowerCaseQuery)) {
          // Extract book, chapter, verse from key (e.g., "창1:1", "Genesis 1:1")
          let bookRef, chapterRef, verseRef;
          
          if (isKorean) {
            const match = key.match(/(\S+?)(\d+):(\d+)/);
            if (match) {
              const abbr = match[1];
              bookRef = allBooks.find(b => KOREAN_BOOK_ABBREVIATIONS[b] === abbr) || abbr;
              chapterRef = parseInt(match[2], 10);
              verseRef = parseInt(match[3], 10);
            }
          } else { // English
            const match = key.match(/([A-Za-z\s\d]+?)\s*(\d+):(\d+)/); // Match book name including spaces
            if (match) {
              bookRef = match[1].trim();
              chapterRef = parseInt(match[2], 10);
              verseRef = parseInt(match[3], 10);
            }
          }

          if (bookRef && chapterRef && verseRef) {
            results.push({
              book: bookRef,
              chapter: chapterRef,
              verse: verseRef,
              text: text,
            });
          }
        }
      }
      return NextResponse.json({ type: 'keyword_results', results: results.slice(0, 100) }); // Limit to first 100 results
    }
  } catch (err: any) {
    console.error('Search API Route Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
