'use client';

import { useState, useEffect, Suspense } from 'react'; // Added Suspense
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

// --- TYPE DEFINITIONS ---
interface Verse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

type SearchResponse = {
  type: 'verse_navigation';
  book: string;
  chapter: number;
  verse?: number;
  error?: string;
} | {
  type: 'keyword_results';
  results: Verse[];
  error?: string;
};

type Language = 'ko' | 'en';

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

    const fetchSearchResults = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&lang=${lang}`);
        const data: SearchResponse = await response.json();

        if (!response.ok) {
          throw new Error(data.error as string || (lang === 'ko' ? '검색 중 오류가 발생했습니다.' : 'An error occurred during search.'));
        }

        if (data.type === 'verse_navigation') {
          const verseParam = data.verse ? `&verse=${data.verse}` : '';
          router.push(`/?book=${encodeURIComponent(data.book)}&chapter=${data.chapter}&lang=${lang}${verseParam}`);
          return;
        } else {
          setResults(data.results);
        }
      } catch (err: any) {
        console.error("Failed to fetch search results:", err);
        setError(err.message || (lang === 'ko' ? '검색 결과를 불러오는 데 실패했습니다.' : 'Failed to load search results.'));
      } finally {
        setLoading(false);
      }
    };

    fetchSearchResults();
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
            href={`/?book=${encodeURIComponent(verse.book)}&chapter=${verse.chapter}&lang=${lang}`}
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
