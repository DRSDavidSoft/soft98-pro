# Site logos

The four `soft98-stock-*.png` files preserve the original Soft98 wordmark and flag. They are bundled for the **Pirate branding off** option while Pro is active. Turning off Pro restores the site's original assets. These are Soft98 marks, not Soft98 Pro artwork.

The sources were the [header sprite](https://soft98.ir/templates/23-09-12-13/images/logo.avif) and [navbar sprite](https://soft98.ir/templates/23-09-12-13/images/navbar-brand.png?2). Decode the AVIF to an sRGB PNG and run:

```sh
magick logo.avif -colorspace sRGB PNG32:logo-sprite.png
node tools/prepare-brand-assets.js logo-sprite.png navbar-brand.png
```

The helper removes the sprite mattes, retains the colored flag, and trims the transparent Pro artwork. The normal build uses only the checked-in PNGs and does not fetch anything from Soft98.
