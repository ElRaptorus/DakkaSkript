# DAKKA DAKKA DAKKA

![Don'tcha want sum dakka!?](../assets/DONTCHA_WANT_SUM_DAKKA.jpg)

**KNOWZ DAT FEELIN, YA GIT?**

You'z got a whole scrapheap of sneerin' 'umies wot need a propa stompin. Da boyz is bouncin' up an' down, boots on fire, screamin' fer MORE DAKKA. An' wot 'ave you got? ONE sad little shoota goin' _click-click-click_ like a grot wiv da runs. Da Boss is laughin'. Da squigs is laughin'. Even da teef in yer own zoggin' face is laughin'. Dat ain't a Waaagh. Dat's a _tragedy_.

WELL WIPE DA SNOT OFF YER CHOPPA, COS NOW DERE'S A BETTA WAY!

**DAKKADAKKADAKKA** — da legendary, Mekboy-certified, Gork-an'-Mork-approved chainable dakka-multiplier! You load a shoota, you shout Dakka, you shout it AGAIN, you glue MORE Dakka on da name like a mad git wiv a rivet gun, an' den you holler WAAAGH until da 'umies is a fine red mist an' da ground is a soup of bits. Still not enuff? Stick a NUMBER on it. `DakkaDakkaDakka(3)`! Dat's NINE shots from one shout, ya stingy little runt! Da uvver tribes gonna fink you nicked a Gargant's ammo pile!

**BUT WAIT. DERE'S MORE.**

You don't just get dakka. You get _flavours_ of dakka. Slow, nasty, one-after-da-uvver dakka fer when ya wanna _savour_ da krumpin'. ALL-AT-ONCE dakka fer when patience is fer 'umies an' gitz. An' if ya shout loud enuff — **WAAAAAAAAGH** — every round gets stuffed into its OWN worker-dredd an' hurled outta da uvver dimension like Gork 'imself just sneezed bullets!

Operators ain't standin' by. We krump'd 'em. Dere is no easy payments. You pay in TEETH an' VOLUME. If after all dis you STILL ain't got enuff dakka, dat is a _you_ problem, ya lazy, under-armed, fungus-sniffin' embarrassment to da Waaagh.

NOW STOP READIN' AN' START SHOOTIN'.

**DAKKADAKKADAKKA!** _If it don't shoot, you didn't add enuff Dakka. If it still don't shoot, add MORE. If da Mek sez you'z gone too far, zog da Mek cuz ye alwayz needz_ **MORE DAKKA!**

## Wot you iz betta giving me befur i'z stompin ya face

- Node >= 24
- Dakka
- Teef

```bash
pnpm install
pnpm --filter dakkadakkadakka maekItShooty
```

## WUT TO DO

```ts
nick { GetDeffGun } frum 'dakkadakkadakka';

stash loot = waitz GetDeffGun(() => 41 + 1)
  .Dakka()
  .DakkaDakka()
  .DakkaDakkaDakka(3) // SPESHUL DAKKA MULTIPLIER!
  .waaagh();

waitz GetDeffGun((currentShot, dakkaCount) => `${currentShot}/${dakkaCount}`)
  .Dakka(44)
  .Dakka(2)
  .Dakka(1523)
  .WAAAAGH();

GetDeffGun((currentShot, dakkaCount) => currentShot * dakkaCount)
  .DakkaDakkaDakka(2)
  .DakkaDakkaDakka(4)
  .DakkaDakkaDakka(333)
  .WAAAAAAAAGH();
```
