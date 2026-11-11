# Turning Shorts views into players

Measured 2026-11-11: ~900 views a Short, **zero sign-ups ever** through a
tracked link. Links in Shorts descriptions and comments are not tappable
(YouTube, since 31 Aug 2023). The one tappable path from a Short is its
**Related video** link, which can only point at one of your own videos — and
a long-form video's description link IS tappable. So the funnel is:

> Short → Related video (long-form) → description link → versearcade.org

Nothing here can be done through the API (the YouTube Data API cannot set a
Short's related video or the banner links), so it is about an hour in
YouTube Studio, once. Every link carries `?src=`, so
`select signup_source, count(*) from profiles group by 1` shows it working.

## 1. Record one long-form video (2–4 minutes)

Landscape or vertical both work; it must be **over 60 seconds** so YouTube
treats it as long-form. Your face and voice, like the hook recordings. A
script to read or loosen:

> I post a verse every day on this channel. If you've wondered what Verse
> Arcade is, here it is in two minutes.
>
> Every day there's one verse — the same one for everybody. You read it, then
> five quick questions about it: who said it, who to, what came right before.
> Get one wrong and it tells you the answer and why, so you learn something
> either way. That's the whole idea — wrong answers teach.
>
> *(Show the app: open the daily verse, answer a question, get one wrong on
> purpose so the teach line shows.)*
>
> There's a trivia round about one book of the Bible each day, a little
> arcade, and you can make your own character. Nobody's ranked against their
> friends — you only ever race yourself.
>
> And if your church plays, your pastor can put the sermon's verse in front
> of everyone all week.
>
> It's free. The link's right under this video — versearcade.org. Play
> today's verse, and I'll see you in tomorrow's.

**Description — this exact first line** (the first line is the one shown):

```
Play today's verse: https://versearcade.org/play?src=yt-related
```

Then pin a comment with the same link.

## 2. Point every Short at it

YouTube Studio on a **desktop** browser → Content → Shorts → each Short →
**Related video** → choose the long-form video. Do the recent and the
best-performing ones first; new Shorts take it in the upload flow. (Needs a
verified channel: Studio → Settings → Channel → Feature eligibility.)

## 3. Banner links

Studio → Customization → Basic info → **Links** → add:

```
Play today's verse — https://versearcade.org/play?src=yt-banner
```

## 4. Check it worked (a week later)

```sql
select signup_source, count(*) from profiles
where created_at > now() - interval '7 days' group by 1;
```

`yt-related` and `yt-banner` rows are YouTube working. Still zero after a week
of ~900-view Shorts means people are not tapping the related link — make the
spoken call to action in the Short itself stronger ("tap the video under this
one").
