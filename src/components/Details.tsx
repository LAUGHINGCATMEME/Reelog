import { useState } from 'react';
import { fmtDateLong, fmtScore } from '../lib/format';
import { useDetails } from '../lib/details';
import type { Kind, Person } from '../lib/types';
import { Icon } from './ui';

function People({ title, people }: { title: string; people: Person[] }) {
  if (!people.length) return null;
  return (
    <>
      <div className="section-label" style={{ paddingTop: 22 }}>{title}</div>
      <div className="people" role="list">
        {people.map((p, i) => (
          <div key={`${p.name}${i}`} className="person" role="listitem">
            <div className="person-img">
              {p.img ? <img src={p.img} alt="" loading="lazy" decoding="async" /> : <Icon name="person" />}
            </div>
            <span className="person-name">{p.name}</span>
            {p.role && <span className="person-role">{p.role}</span>}
          </div>
        ))}
      </div>
    </>
  );
}

/** "Sat 1 Nov" for an ISO date or timestamp, with the year only when it isn't this year. */
function airDate(at: string) {
  const d = new Date(at.length === 10 ? `${at}T12:00:00` : at);
  if (Number.isNaN(d.getTime())) return fmtDateLong(at.slice(0, 10));
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

/**
 * Overview, facts, cast and crew of a title: what TMDB or AniList has to say about it. `title` is
 * the one shown above, left out of an anime's English and Romaji titles.
 */
export function TitleDetails({ kind, id, tmdbKey, title }: { kind: Kind; id: number; tmdbKey: string; title?: string }) {
  const { d, loading } = useDetails(kind, id, tmdbKey);
  const [more, setMore] = useState(false);
  if (!d) {
    return loading ? (
      <div className="about about--loading" aria-label="Loading details">
        <div className="skel-line" /><div className="skel-line" /><div className="skel-line" />
      </div>
    ) : null;
  }
  const long = (d.overview?.length ?? 0) > 280;
  const shown = d.facts.filter(([k, v]) => !((k === 'English' || k === 'Romaji') && v === title));
  const facts = d.score ? [...shown, [kind === 'anime' ? 'AniList score' : 'TMDB score', `${fmtScore(d.score)} / 10`] as [string, string]] : shown;
  return (
    <>
      {(d.overview || d.tagline || d.next) && (
        <div className="about">
          {d.next && (
            <div className="next-ep">
              <Icon name="schedule" />
              <span>
                Next: <b>{d.next.season != null ? `S${d.next.season} ` : ''}E{d.next.ep}</b> · {airDate(d.next.at)}
              </span>
            </div>
          )}
          {d.tagline && <p className="tagline">{d.tagline}</p>}
          {d.overview && (
            <>
              <p className="synopsis" data-clamp={long && !more}>{d.overview}</p>
              {long && (
                <button className="text-btn text-btn--inline" onClick={() => setMore(!more)}>
                  {more ? 'Less' : 'More'}<Icon name={more ? 'expand_less' : 'expand_more'} />
                </button>
              )}
            </>
          )}
        </div>
      )}
      {!!facts.length && (
        <>
          <div className="section-label" style={{ paddingTop: 22 }}>DETAILS</div>
          <dl className="facts">
            {facts.map(([k, v]) => (
              <div key={k} className="fact"><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
        </>
      )}
      <People title={kind === 'anime' ? 'CHARACTERS' : 'CAST'} people={d.cast} />
      <People title={kind === 'anime' ? 'STAFF' : 'CREW'} people={d.crew} />
    </>
  );
}

/** When a title was first and last watched, from all of its entries. */
export function WatchSpan({ first, last }: { first: string; last: string }) {
  if (!first) return null;
  return (
    <div className="span-row">
      <div><span className="stat-label">FIRST WATCHED</span><span className="span-v">{fmtDateLong(first)}</span></div>
      <div><span className="stat-label">LAST WATCHED</span><span className="span-v">{fmtDateLong(last)}</span></div>
    </div>
  );
}
