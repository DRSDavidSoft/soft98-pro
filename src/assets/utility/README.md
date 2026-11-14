# Utility icon sources

- `firefox.svg` and `freedownloadmanager.svg`: [Papirus icon theme](https://github.com/PapirusDevelopmentTeam/papirus-icon-theme/tree/33d971eb2d0c8454bac58246687de78e58f960c8/Papirus/48x48/apps), unmodified SVGs, copyright their contributors. [GPL-3.0 license](PAPIRUS-LICENSE.txt). The files retain their own license when bundled.
- `chrome.svg`, `edge.svg`, `winrar.svg`, and `revo.svg`: independently drawn identifiers for the named entries, not official vendor assets or extracted executable resources.
- `../vlc.png`: official VideoLAN artwork used under the [VideoLAN logo terms](https://www.videolan.org/goodies.html).

Product names and marks identify the links on Soft98. No endorsement or affiliation is implied.

## Expanded list audit

Reviewed 2026-11-14 against the [Soft98 homepage utility list](https://soft98.ir/)
and its linked destinations. The [catalog](../../utility-artwork.json) records all
23 visible destinations, including observed redirect aliases. Soft98 establishes
what each row links to, not permission to reuse any artwork. No Soft98 images,
vendor favicon files, or installer icons were copied.

New artwork:

- [LeoMoon ParsiNegar](https://leomoon.com/downloads/desktop-apps/leomoon-parsinegar/):
  the [v3.0.5 application SVG](https://github.com/leomoon-studios/leomoon-parsinegar/blob/40eecbd529c5661555bd6fc4dea0f6174509a1a8/assets/app-icon.svg)
  is an original resource of the upstream MIT-licensed desktop project. The
  [upstream third-party inventory](https://github.com/leomoon-studios/leomoon-parsinegar/blob/40eecbd529c5661555bd6fc4dea0f6174509a1a8/THIRD_PARTY_NOTICES.md)
  separately identifies the Vazirmatn font; this SVG contains an outlined glyph
  but no font software ([OFL artwork guidance](https://openfontlicense.org/ofl-faq/#11-can-i-use-the-fonts-for-a-book-or-other-print-publication-to-create-logos-or-other-graphics-or-even-to-manufacture-objects-based-on-their-outlines)).
  Artwork unchanged apart from a final newline. Include [LeoMoon's MIT notice](PARSINEGAR-MIT.txt).
- [Java SE Runtime / JDK](https://www.oracle.com/java/technologies/javase/javase8-archive-downloads.html):
  Oracle expressly allows [Duke to represent Java](https://www.oracle.com/a/ocom/docs/java-licensing-logo-guidelines-1908204.pdf)
  under BSD terms. The bundled [Project Duke source](https://github.com/openjdk/duke/blob/eacfa3a4ee49a5f1810238e8adb15430bf42688a/vector/Hips.svg)
  uses the original shapes and colors, with a tighter square view box and no
  external DTD. Include the [Sun BSD notice](DUKE-BSD.txt). Duke represents Java
  generally; it is not an Oracle JRE product logo. Do not use the coffee cup
  (written commercial license) or the OpenJDK logo (different identity).

Fallbacks where artwork is not usable:

| Soft98 destination | Audit decision |
| --- | --- |
| Download Manager, Music Player, Video Player, CD/DVD Burning, Virtual Drive, Remote, Display Driver | Tag pages with multiple utilities. Do not assign FDM, AIMP, VLC, a disc tool, a virtual-drive vendor, AnyDesk/RustDesk, or a GPU vendor. |
| ESET and Kaspersky | Vendor-wide tag pages, not individual security products. [ESET press-kit terms](https://www.eset.com/ca/about/newsroom/press-kit/) require approval; no applicable permission was verified for Kaspersky. Keep shields. |
| Foxit PDF Reader | `FPR` token. [Foxit Reader](https://www.foxit.com/pdf-reader/), not Foxit Editor or Adobe Reader. No separate reuse grant verified under [Foxit terms, section 3.3](https://www.foxit.com/product/terms-of-service/). |
| Windows Firewall Control | `WFC` token. [BiniSoft/Malwarebytes WFC](https://www.binisoft.org/wfc), not Defender or a Microsoft app. No artwork grant verified in the [vendor terms](https://www.malwarebytes.com/tos). |
| Advanced SystemCare | The destination covers Pro and Ultimate; the [IObit press room](https://www.iobit.com/en/pressroom.php) publishes distinct kits. No grant was found to ship either kit's icon in this extension/userscript. |
| Microsoft Visual C++ | `VCR` token. [VC++ Redistributable](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist/), not Visual Studio or VS Code. Installer redistribution terms are not icon terms; see [Microsoft brand guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks). |
| Microsoft .NET | Soft98's older Framework slug resolves to a Runtime/SDK listing covering multiple versions. Microsoft [distinguishes .NET Framework from modern .NET](https://dotnet.microsoft.com/en-us/download/dotnet-framework). [Brand rules, p. 9](https://github.com/dotnet/brand/blob/91845f6ddf2123b3bb1bfd1b6a386d9ce02b43aa/dotnet-styleGuide-2024.pdf) require 50 px for the square platform logo, or 70 x 27 px for the logotype. Neither fits this slot. |
| BlueLife Hosts Editor and Net Disabler | `BHE` and `ND` tokens. Exact products verified on [BlueLife Hosts Editor](https://www.sordum.org/8266/bluelifehosts-editor-v1-6/) and [Net Disabler](https://www.sordum.org/9660/net-disabler-v1-2/). [Sordum's EULA](https://www.sordum.org/eula/) covers unmodified software distribution, not separate artwork reuse. |

The catalog preserves existing WinRAR, Firefox, Chrome, Edge, and Revo icon keys
for their exact product rows. This does not clear those existing assets for
release. The [Simple Icons disclaimer](https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md)
also makes clear that the package's CC0 label does not grant rights to every
individual logo or its underlying marks.

## Integration handoff

1. In the build, read `src/utility-artwork.json`. Load each `artwork` SVG from this
   directory into `PAGE_ICONS[icon]` using the existing base64 SVG `<img alt="">`
   pattern and load `genericIcons` using the existing Tabler loader/notice.
   For each `tokens` record generate a static 32 x 32 SVG in the same image format:
   rounded rect (5 px radius) in `background`, centered upright bold 10 px
   sans-serif in `foreground`, baseline at 20 px. Validate `text` as 2-3 uppercase
   ASCII letters and colors as six-digit hex before interpolating. Tokens are
   original, non-logo artwork under the project's MIT license and need no new
   third-party notice.
   Emit only a flat normalized path-to-icon map from `rows` into the shared
   runtime; provenance stays build-time. Include both new full notices in the
   preserved inline notice (standalone userscript included), and copy them to
   the Chromium, Firefox, and userscript package directories if notices are
   shipped separately there.
2. In the utility card only, pass the actual anchor to the icon resolver. Require
   an HTTP(S) destination on the page's Soft98 origin, then use lowercased
   `URL.pathname` with `%2b` normalized to `+`; ignore query and fragment. Look up
   an exact key. Do not use substring slug matching, infer identity from the
   label, or follow redirects at runtime. Use a neutral fallback for unknown
   destinations, and do not fall through to the old product regexes for known
   generic rows. Do not change the anchor or visible text. Use the existing
   decorative icon rendering.
3. Run `node --test test/utility-artwork.js`, then verify the integrated build
   and expanded dialog in an isolated browser context. No changes to the build
   or runtime are included in this handoff. Release stays on hold.
