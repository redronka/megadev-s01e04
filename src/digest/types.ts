export type RunStatus = 'ok' | 'retry' | 'fail';

/** Liczby poprawnych zdarzeń w całej nocy, przed grupowaniem według job. */
export type DigestCounts = Record<RunStatus, number>;

/** Jeden wiersz dla każdej dokładnej wartości job. */
export type DigestRow = {
  job: string;
  /** Właściciel ostatniego zdarzenia. null pozostaje null. */
  owner: string | null;
  /** Liczba wszystkich poprawnych zdarzeń tego zadania. */
  runs: number;
  /** Liczba zdarzeń ze statusem retry. */
  retries: number;
  /** Liczba zdarzeń ze statusem fail, również przed późniejszym ok. */
  failures: number;
  lastStatus: RunStatus;
  /** Ostatnie podane error; późniejsze zdarzenie bez error go nie usuwa. */
  lastError: string | null;
  /** Oryginalne at najwcześniejszego zdarzenia, ze strefą czasową. */
  firstAt: string;
  /** Oryginalne at najpóźniejszego zdarzenia, ze strefą czasową. */
  lastAt: string;
};

export type NightDigest = {
  night: string;
  /** Rosnąco według job, przez porównanie < i >, bez zależności od locale. */
  rows: DigestRow[];
  /** Liczba niepustych linii z błędnym JSON lub niepoprawnym zdarzeniem. */
  badLines: number;
  counts: DigestCounts;
};

/**
 * Kontrakt funkcji readNight eksportowanej docelowo z ./reader.js.
 * Ten plik eksportuje wyłącznie typy. Nie zawiera implementacji czytnika.
 *
 * Czyta synchronicznie runsDir/<night>.jsonl jako UTF-8.
 * night musi być rzeczywistą datą kalendarzową w formacie YYYY-MM-DD.
 * Niepoprawne night zwraca null bez dostępu do pliku.
 * Brak pliku (ENOENT) zwraca null. Inne błędy odczytu są zgłaszane.
 *
 * Każda niepusta linia zawiera jeden obiekt JSON. Poprawne zdarzenie ma:
 * - at: poprawny znacznik ISO 8601 YYYY-MM-DDTHH:mm:ss[.SSS] z Z lub ±HH:mm;
 * - job: niepusty ciąg znaków;
 * - status: ok, retry lub fail;
 * - owner: ciąg znaków lub null (pole jest wymagane);
 * - error: opcjonalny ciąg znaków.
 * Dodatkowe pola są pomijane. Wartości ciągów nie są przycinane.
 * Błędna linia zwiększa badLines o 1. Nie przerywa odczytu.
 * Puste linie i linie z samymi białymi znakami są pomijane.
 *
 * Grupowanie używa dokładnej wartości job. runs liczy wszystkie poprawne
 * zdarzenia, retries liczy retry, a failures liczy fail.
 * counts liczy te same poprawne zdarzenia według statusu w całej nocy.
 * Kolejność zdarzeń wyznacza czas at po uwzględnieniu przesunięcia strefy.
 * Przy równym czasie późniejsza linia oznacza późniejsze zdarzenie.
 * owner i lastStatus pochodzą z ostatniego zdarzenia w tej kolejności.
 * lastError pochodzi z ostatniego zdarzenia, które zawiera error.
 * Jeśli żadne zdarzenie nie ma error, lastError wynosi null.
 * firstAt i lastAt zachowują oryginalny tekst at, bez konwersji strefy.
 * rows są sortowane rosnąco według job, przez porównanie < i >.
 *
 * Pusty plik zwraca { night, rows: [], badLines: 0,
 * counts: { ok: 0, retry: 0, fail: 0 } }.
 * Plik z samymi błędnymi liniami ma puste rows i odpowiednie badLines.
 * Wiersz z owner: null pozostaje w wyniku. Widok wyświetla null jako —.
 * Czytnik nigdy nie zapisuje plików wejściowych.
 */
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
