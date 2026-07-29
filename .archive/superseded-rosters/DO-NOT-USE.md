# Superseded rosters — DO NOT USE

Every file here is WRONG. They are kept only because `TOP 100.xlsx` and
`TOP 120.xlsx` are the source material the real list is generated *from*.

**The only roster is `/TOP 100.csv` in the repo root.**

Why these are wrong:
- `TOP 100.xlsx` contains 94 figure rows, not 100 — duos occupy one row and the
  import mangled others.
- `TOP 120.xlsx` contains 113 — a superset including figures never cast.
- None of them reflect any roster decision made during the build: eight removals
  (Gautama, Heisenberg, Marconi, Haber, Mullis, Berners-Lee, Yamanaka, Doudna),
  two trims (Bardeen, Ritchie), or twelve additions.
- Reading one of these is what caused a Siddhartha Gautama film to be drafted
  for a character with no canonical image.

Regenerate the real list:  node scripts/build-top-100.mjs
Verify it:                 node scripts/validate-top-100.mjs
