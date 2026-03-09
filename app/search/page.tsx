'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { KOREAN_BOOK_ABBREVIATIONS } from '@/lib/bookAbbreviations';
import { ENGLISH_BOOK_ABBREVIATIONS } from '@/lib/enBookAbbreviations'; 
import { KOREAN_TO_ENGLISH_BOOK_MAP } from '@/lib/bookMapping';
import { OLD_TESTAMENT_BOOKS, NEW_TESTAMENT_BOOKS } from '@/lib/books'; 
import KoreanBibleData from '@/lib/ko_krv_bible.json';
import EnglishBibleData from '@/lib/en_kjv_bible.json';

// --- TYPE DEFINITIONS ---
interface Verse {
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

type Language = 'ko' | 'en';

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

// Separate content into a component to use Suspense
function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [results, setResults] = useState<Verse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = searchParams.get('q');
  const lang = searchParams.get('lang') as Language || 'ko';

  useEffect(() => {
    if (!query) {
      setError(lang === 'ko' ? '검색어가 없습니다.' : 'No search query provided.');
      setLoading(false);
      return;
    }

    const performSearch = () => {
      setLoading(true);
      setError(null);
      try {
        const isKorean = lang === 'ko';
        const bibleData = isKorean ? KoreanBible : EnglishBible;
        const allBooks = [...OLD_TESTAMENT_BOOKS, ...NEW_TESTAMENT_BOOKS];

        const parsedRef = parseVerseReference(query, lang);
        if (parsedRef && parsedRef.book && parsedRef.chapter) {
          const verseParam = parsedRef.verse ? `&verse=${parsedRef.verse}` : '';
          router.push(`/?book=${encodeURIComponent(parsedRef.book)}&chapter=${parsedRef.chapter}&lang=${lang}${verseParam}`);
          return;
        } else {
          const searchResults: Verse[] = [];
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
                searchResults.push({ book: bookRef, chapter: chapterRef, verse: verseRef, text });
              }
            }
            if (searchResults.length >= 100) break;
          }
          setResults(searchResults);
        }
      } catch (err: any) {
        console.error("Failed to perform search:", err);
        setError(lang === 'ko' ? '검색 결과를 불러오는 데 실패했습니다.' : 'Failed to load search results.');
      } finally {
        setLoading(false);
      }
    };

    performSearch();
  }, [query, lang, router]);

  const highlightText = (text: string, searchTerm: string) => {
    if (!searchTerm) return text;
    const parts = text.split(new RegExp(`(${searchTerm})`, 'gi'));
    return (
      <span>
        {parts.map((part, i) => 
          part.toLowerCase() === searchTerm.toLowerCase() ? (
            <strong key={i} style={{ color: '#0d6efd' }}>{part}</strong>
          ) : (
            part
          )
        )}
      </span>
    );
  };

  if (loading) {
    return <div className="container mt-5 text-center"><div className="spinner-border" role="status"><span className="visually-hidden">{lang === 'ko' ? '로딩 중...' : 'Loading...'}</span></div></div>;
  }

  if (error) {
    return <div className="container mt-5 text-center text-danger"><h4>{lang === 'ko' ? '오류 발생' : 'Error'}</h4><p>{error}</p></div>;
  }

  if (results.length === 0) {
    return (
      <div className="container mt-5 text-center">
        <h4>{lang === 'ko' ? '검색 결과 없음' : 'No results found'}</h4>
        <p>{lang === 'ko' ? `'${query}'에 대한 검색 결과를 찾을 수 없습니다.` : `No search results found for '${query}'.`}</p>
        <Link href="/" className="btn btn-primary">{lang === 'ko' ? '메인 페이지로 돌아가기' : 'Go to main page'}</Link>
      </div>
    );
  }

  return (
    <div className="container mt-5">
      <h2 className="mb-4">{lang === 'ko' ? `'${query}' 검색 결과` : `Search Results for '${query}'`} ({results.length})</h2>
      <Link href="/" className="btn btn-secondary mb-4">{lang === 'ko' ? '메인 페이지로 돌아가기' : 'Go to main page'}</Link>
      <div className="list-group">
        {results.map((verse, index) => (
          <Link
            key={index}
            href={`/?book=${encodeURIComponent(verse.book)}&chapter=${verse.chapter}&lang=${lang}&verse=${verse.verse}`}
            className="list-group-item list-group-item-action flex-column align-items-start"
          >
            <div className="d-flex w-100 justify-content-between">
              <h5 className="mb-1">{verse.book} {verse.chapter}:{verse.verse}</h5>
            </div>
            <p className="mb-1">{highlightText(verse.text, query || '')}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

// Main SearchResultsPage component wrapped in Suspense
export default function SearchResultsPage() {
  return (
    <Suspense fallback={<div className="container mt-5 text-center">Loading...</div>}>
      <SearchContent />
    </Suspense>
  );
}
