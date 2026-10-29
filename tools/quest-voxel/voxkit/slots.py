"""Palette-independent linear multipliers; the normal rgb path is preview-only."""
from dataclasses import dataclass
import hashlib
from .palette import linear

SLOTS = ('baked', 'skin', 'skin_shade', 'hair', 'hair_shade', 'top', 'top_trim', 'bottom', 'shoes', 'accent')
DEFAULT = dict(skin='#b97d59', skin_shade='#d39c72', hair='#423536', hair_shade='#684737',
               top='#54a8aa', top_trim='#32777e', bottom='#303c56', shoes='#f4efe6', accent='#dbb659')


def srgb(rgb):
    return tuple(12.92*v if v <= .0031308 else 1.055*v**(1/2.4)-.055 for v in rgb)


def hex_linear(value):
    return linear(tuple(int(value.lstrip('#')[i:i+2], 16)/255 for i in (0, 2, 4)))


@dataclass(frozen=True)
class Slot:
    name: str
    shade: float = .92
    jitter: float = .075

    def __post_init__(self):
        if self.name not in SLOTS[1:]:
            raise ValueError(self.name)
        if not 0 < self.shade <= 1 or not 0 <= self.jitter <= 1:
            raise ValueError('Invalid slot multiplier')

    @property
    def index(self):
        return SLOTS.index(self.name)

    def multiplier(self, cell=(0, 0, 0), seed=''):
        d = hashlib.blake2s(f'{seed}:{cell}:{self.name}'.encode(), digest_size=4).digest()
        noise = int.from_bytes(d[:2], 'little')/65535*2-1
        tint = (d[2]/255*2-1)*.008
        shade = self.shade*(1+noise*self.jitter)
        return tuple(max(0, min(1, shade*(1+t))) for t in (tint, 0, -tint))

    def rgb(self, cell=(0, 0, 0), seed=''):
        return srgb(tuple(c*s for c, s in zip(hex_linear(DEFAULT[self.name]), self.multiplier(cell, seed))))
