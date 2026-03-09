'use client';

import { useState, useEffect, useRef } from 'react';
import { OLD_TESTAMENT_BOOKS, NEW_TESTAMENT_BOOKS } from '@/lib/books';
import { KOREAN_TO_ENGLISH_BOOK_MAP } from '@/lib/bookMapping';
import { useRouter, useSearchParams } from 'next/navigation'; // Import useRouter and useSearchParams
import { KOREAN_BOOK_ABBREVIATIONS } from '@/lib/bookAbbreviations'; // For voice search parsing
import { ENGLISH_BOOK_ABBREVIATIONS } from '@/lib/enBookAbbreviations'; // For voice search parsing

// Extend Window interface for SpeechRecognition
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

// --- TYPE DEFINITIONS ---
interface Verse {
  verse: number;
  text: string;
}
type Language = 'ko' | 'en';
type Testament = 'old' | 'new';

// Helper function to map abbreviation to full book name
const mapAbbrToFullName = (abbr: string, lang: Language): string | undefined => {
  if (lang === 'ko') {
    const fullBook = OLD_TESTAMENT_BOOKS.find(b => KOREAN_BOOK_ABBREVIATIONS[b] === abbr) || NEW_TESTAMENT_BOOKS.find(b => KOREAN_BOOK_ABBREVIATIONS[b] === abbr);
    return fullBook;
  } else { // 'en'
    const fullBook = Object.keys(ENGLISH_BOOK_ABBREVIATIONS).find(key => ENGLISH_BOOK_ABBREVIATIONS[key] === abbr) || abbr;
    // For English, the JSON uses full names, so if it's an abbreviation, we need to map it back to full name.
    // However, the `ENGLISH_BOOK_ABBREVIATIONS` map already contains full names as values for their abbreviations.
    return fullBook;
  }
};


// --- MAIN COMPONENT ---
export default function Home() {
  // --- STATE MANAGEMENT ---
  const router = useRouter();
  const searchParams = useSearchParams();

  const [language, setLanguage] = useState<Language>('ko');
  const [testament, setTestament] = useState<Testament>('old');
  const [book, setBook] = useState('창세기');
  const [chapter, setChapter] = useState(1);
  const [verses, setVerses] = useState<Verse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedVerse, setCopiedVerse] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // States for Speech Recognition
  const [isListening, setIsListening] = useState(false);
  const [speechApiSupported, setSpeechApiSupported] = useState(false);
  const [scrollToVerse, setScrollToVerse] = useState<number | null>(null);
  const recognitionRef = useRef<any>(null);
  
  const verseRefs = useRef<(HTMLDivElement | null)[]>([]); // Ref to store verse elements for scrolling

  // --- DERIVED STATE ---
  const displayedBooks = testament === 'old' ? OLD_TESTAMENT_BOOKS : NEW_TESTAMENT_BOOKS;

  // --- EFFECTS ---

  // Initialize state from URL params on mount
  useEffect(() => {
    const urlLang = searchParams.get('lang') as Language;
    const urlBook = searchParams.get('book');
    const urlChapter = searchParams.get('chapter');
    const urlVerse = searchParams.get('verse');

    if (urlLang) setLanguage(urlLang);
    
    if (urlBook) {
        setBook(urlBook);
        if (OLD_TESTAMENT_BOOKS.includes(urlBook)) {
            setTestament('old');
        } else if (NEW_TESTAMENT_BOOKS.includes(urlBook)) {
            setTestament('new');
        }
    }
    if (urlChapter) setChapter(parseInt(urlChapter, 10));
    if (urlVerse) setScrollToVerse(parseInt(urlVerse, 10));
  }, [searchParams]); // Rerun if URL params change

  // Check for Speech API support on mount
  useEffect(() => {
    const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    setSpeechApiSupported(!!SpeechRecognition);
  }, []);

  // Effect to handle book selection when testament changes
  useEffect(() => {
    // Only update if the current book is not in the new testament.
    // This prevents unwanted changes when navigating from search results.
    if (!displayedBooks.includes(book)) {
      const firstBookOfTestament = testament === 'old' ? OLD_TESTAMENT_BOOKS[0] : NEW_TESTAMENT_BOOKS[0];
      setBook(firstBookOfTestament);
      setChapter(1);
    }
  }, [testament, book, displayedBooks]); // Added 'book' to dependencies to avoid unnecessary updates if book is already correct.


  // Effect to fetch chapter data
  useEffect(() => {
    const fetchChapter = async () => {
      if (!book || !chapter) return;
      setIsLoading(true);
      setError(null);
      setVerses([]); // Clear verses before fetching new ones
      
      try {
        let apiUrl = `/api/bible?lang=${language}&book=${book}&chapter=${chapter}`;
        
        const response = await fetch(apiUrl);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'An unknown error occurred.');
        setVerses(data);
      } catch (err: any) {
        setError(err.message);
        setVerses([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchChapter();
  }, [book, chapter, language]);

  // Effect to scroll to a specific verse after verses are loaded
  useEffect(() => {
    if (scrollToVerse && verses.length > 0) {
      const verseElement = verseRefs.current[scrollToVerse];
      if (verseElement) {
        verseElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Optional: Highlight the verse temporarily
        verseElement.style.backgroundColor = '#fff3cd'; // Bootstrap warning yellow
        setTimeout(() => {
          if (verseElement) verseElement.style.backgroundColor = '';
        }, 3000);
      }
      setScrollToVerse(null); // Reset after scrolling
    }
  }, [verses, scrollToVerse]);
  
  // --- HANDLER FUNCTIONS ---

  const handleChapterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (value > 0) setChapter(value);
  };

  const handleCopy = (verse: Verse) => {
    navigator.clipboard.writeText(verse.text).then(() => {
      setCopiedVerse(verse.verse);
      setTimeout(() => setCopiedVerse(null), 2000);
    });
  };

  const parseAndNavigate = (transcript: string) => {
    let match: RegExpMatchArray | null = null;
    let fullBookName: string | undefined;
    let foundChapter = 0;
    let foundVerse: number | null = null;
  
    // Try parsing as Korean first
    if (language === 'ko') {
      match = transcript.match(/(\S+?)\s*(\d+)(?:장|:)\s*(?:(\d+)\s*절)?/);
      if (match) {
        const bookPart = match[1].trim();
        fullBookName = OLD_TESTAMENT_BOOKS.find(b => KOREAN_BOOK_ABBREVIATIONS[b] === bookPart || b === bookPart) ||
                       NEW_TESTAMENT_BOOKS.find(b => KOREAN_BOOK_ABBREVIATIONS[b] === bookPart || b === bookPart);
        foundChapter = parseInt(match[2], 10);
        foundVerse = match[3] ? parseInt(match[3], 10) : null;
      }
    }
  
    // If not Korean or no match, try parsing as English
    if (!match || !fullBookName) { // Check both match and fullBookName
      match = transcript.match(/([A-Za-z\s\d]+?)\s*(\d+):?(\d+)?/i);
      if (match) {
        const bookPart = match[1].trim().toLowerCase();
        // Try to map English abbreviation/full name to our full name list
        fullBookName = Object.keys(KOREAN_TO_ENGLISH_BOOK_MAP).find(koName => {
          const enName = KOREAN_TO_ENGLISH_BOOK_MAP[koName];
          const enAbbr = ENGLISH_BOOK_ABBREVIATIONS[enName];
          return (
            (enName && enName.toLowerCase() === bookPart) ||
            (enAbbr && enAbbr.toLowerCase() === bookPart) ||
            koName.toLowerCase() === bookPart
          );
        });
        foundChapter = parseInt(match[2], 10);
        foundVerse = match[3] ? parseInt(match[3], 10) : null;
      }
    }
  
    if (fullBookName && foundChapter) {
      if (OLD_TESTAMENT_BOOKS.includes(fullBookName)) {
        setTestament('old');
      } else if (NEW_TESTAMENT_BOOKS.includes(fullBookName)) {
        setTestament('new');
      }
      setBook(fullBookName);
      setChapter(foundChapter);
      if (foundVerse) {
        setScrollToVerse(foundVerse);
      }
    } else {
      alert(`'${transcript}' 구절을 찾지 못했습니다. "요한복음 3장 16절" 또는 "John 3:16"과 같은 형식으로 말씀해주세요.`);
    }
  };
  

  const handleVoiceSearch = () => {
    if (!speechApiSupported) {
      alert("음성 찾기 기능은 현재 사용 중인 브라우저를 지원하지 않습니다. Chrome, Safari, Edge 브라우저를 이용해주세요.");
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = language === 'ko' ? 'ko-KR' : 'en-US'; // Set recognition language
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    
    recognitionRef.current = recognition;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
      alert(`음성 인식 오류: ${event.error}. 마이크 권한을 확인해주세요.`);
    };
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      parseAndNavigate(transcript);
    };

    recognition.start();
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery)}&lang=${language}`);
    }
  };

  // --- RENDER ---
  return (
    <main className="container mt-5 mb-5">
      <div className="d-flex justify-content-end mb-3">
        <button className={`btn btn-sm ${language === 'ko' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setLanguage('ko')}>한국어</button>
        <button className={`btn btn-sm ms-2 ${language === 'en' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setLanguage('en')}>English</button>
      </div>

      <h1 className="mb-4 text-center">{language === 'ko' ? '성경 읽기' : 'Bible Reader'}</h1>
      
      <div className="d-flex justify-content-center mb-3">
        <div className="btn-group">
          <button className={`btn ${testament === 'old' ? 'btn-info' : 'btn-outline-secondary'}`} onClick={() => setTestament('old')}>구약</button>
          <button className={`btn ${testament === 'new' ? 'btn-info' : 'btn-outline-secondary'}`} onClick={() => setTestament('new')}>신약</button>
        </div>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearchSubmit} className="mb-4">
        <div className="input-group">
          <input 
            type="text" 
            className="form-control" 
            placeholder={language === 'ko' ? "검색 (예: 요 3:16, 평화)" : "Search (e.g., John 3:16, peace)"}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search query"
          />
          <button className="btn btn-primary" type="submit">{language === 'ko' ? '검색' : 'Search'}</button>
        </div>
      </form>

      <div className="row g-3 align-items-center justify-content-center mb-4">
        <div className="col-auto">
          <select className="form-select" value={book} onChange={(e) => { setBook(e.target.value); setChapter(1); }} aria-label="Select Book">
            {displayedBooks.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div className="col-auto">
          <input type="number" className="form-control" value={chapter} onChange={handleChapterChange} min="1" aria-label="Chapter Input" style={{ width: '100px' }} />
        </div>
        <div className="col-auto"><span className="fs-5">{language === 'ko' ? '장' : 'Ch.'}</span></div>
        <div className="col-auto">
           <button className={`btn ${isListening ? 'btn-danger' : 'btn-outline-primary'}`} onClick={handleVoiceSearch} disabled={!speechApiSupported} title={language === 'ko' ? "음성으로 구절 찾기" : "Find by voice"}>
             🎤
           </button>
        </div>
      </div>
      {!speechApiSupported && <p className="text-center text-muted small">음성 찾기 기능은 현재 사용 중인 브라우저를 지원하지 않습니다.<br/>Chrome, Safari, Edge 브라우저에서 이용해주세요.</p>}

      <div className="card">
        <div className="card-header">{book} {chapter}{language === 'ko' ? '장' : ''}</div>
        <div className="card-body">
          {isLoading && <p className="text-center">{language === 'ko' ? '로딩 중...' : 'Loading...'}</p>}
          {error && <p className="text-center text-danger">{error}</p>}
          {!isLoading && !error && verses.length > 0 && (
            <div>
              {verses.map((verse) => (
                <div key={verse.verse} 
                     ref={el => { verseRefs.current[verse.verse] = el; }} // Fixed ref assignment
                     className="d-flex justify-content-between align-items-start mb-2"
                >
                  <p className="mb-0"><strong>{verse.verse}</strong> {verse.text}</p>
                  <button 
                    className={`btn btn-sm ${copiedVerse === verse.verse ? 'btn-success' : 'btn-outline-secondary'} ms-3`}
                    onClick={() => handleCopy(verse)}
                    style={{ minWidth: '80px' }}
                  >
                    {copiedVerse === verse.verse ? (language === 'ko' ? '복사됨!' : 'Copied!') : (language === 'ko' ? '복사' : 'Copy')}
                  </button>
                </div>
              ))}
            </div>
          )}
          {!isLoading && !error && verses.length === 0 && !isLoading && <p className="text-center">{language === 'ko' ? '해당 장의 내용을 불러올 수 없습니다.' : 'Could not load chapter content.'}</p>}
        </div>
      </div>
    </main>
  );
}