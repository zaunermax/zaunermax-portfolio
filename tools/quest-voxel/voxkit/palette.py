"""Shared sRGB palette. Jitter is relative HLS lightness, never Python's random hash."""
from dataclasses import dataclass
import colorsys
import hashlib


@dataclass(frozen=True)
class Colour:
    hex: str
    jitter: float = .045
    hue_drift: float = .004

    def rgb(self, cell=(0, 0, 0), seed=""):
        rgb = tuple(int(self.hex.lstrip("#")[i:i+2], 16) / 255 for i in (0, 2, 4))
        if not self.jitter:
            return rgb
        h, l, s = colorsys.rgb_to_hls(*rgb)
        digest = hashlib.blake2s(f"{seed}:{cell}:{self.hex}".encode(), digest_size=4).digest()
        noise = int.from_bytes(digest[:2], "little") / 65535 * 2 - 1
        hue = int.from_bytes(digest[2:], "little") / 65535 * 2 - 1
        return colorsys.hls_to_rgb((h + hue * self.hue_drift) % 1,
                                  max(0, min(1, l * (1 + noise * self.jitter))), s)


PALETTE = {
    "ink": Colour("#2b293c"), "navy": Colour("#303c56", .025),
    "metal": Colour("#667b8d"), "metal_light": Colour("#9bb1b7"),
    "wood": Colour("#d8aa70"), "wood_light": Colour("#eac68c"),
    "wood_dark": Colour("#af7b50"), "cream": Colour("#f4efe6", .03),
    "teal": Colour("#54a8aa"), "teal_dark": Colour("#32777e"),
    "teal_light": Colour("#88c6be"), "coral": Colour("#de8271"),
    "coral_dark": Colour("#b65e59"), "mustard": Colour("#dbb659"),
    "lilac": Colour("#b19ac9"), "sage": Colour("#9aad83"),
    "leaf": Colour("#559568"), "leaf_dark": Colour("#386d55"),
    "leaf_light": Colour("#9abd69"), "soil": Colour("#665044"),
    "skin": Colour("#e9b891", .03), "skin_shadow": Colour("#ce9277", .03),
    "skin_deep": Colour("#b97d59", .03), "skin_deep_light": Colour("#d39c72", .03),
    "hair": Colour("#684737"), "hair_light": Colour("#8b6246"),
    "hair_dark": Colour("#423536"),
    "screen": Colour("#2e384c", 0), "cyan": Colour("#8adbd5", 0),
    "led": Colour("#e5cf83", 0), "ui_coral": Colour("#ef9a91", 0),
    "glass": Colour("#b9dfdc", 0), "coffee": Colour("#62473c", .02),
}


def colour(value):
    return value if hasattr(value, "rgb") else PALETTE[value]


def linear(rgb):
    """glTF COLOR_0 is linear; palette literals and artists' eyes are sRGB."""
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb)
