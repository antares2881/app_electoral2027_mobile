"""Generate synthetic PDF417 fixtures and verify exact decoded bytes locally."""
import json
from pathlib import Path
from importlib.metadata import version

from pdf417gen import encode, render_image
import zxingcpp

ROOT = Path(__file__).resolve().parent
CASES = {
    '01-texto': b'DEMO|NUMERO=0000123456|FIN',
    '02-salto-linea': b'DEMO\nNUMERO=0000123456\nFIN',
    '03-separador-nulo': b'DEMO\x00NUMERO=0000123456\x00FIN',
    '04-separador-grupo': b'DEMO\x1dNUMERO=0000123456\x1dFIN',
}


def main():
    output = ROOT / 'fixtures'
    output.mkdir(exist_ok=True)
    results = []
    for name, payload in CASES.items():
        image = render_image(encode(payload, columns=6, security_level=4), scale=5, ratio=3, padding=40)
        image.save(output / (name + '.png'))
        decoded = zxingcpp.read_barcode(image, formats=zxingcpp.BarcodeFormat.PDF417)
        actual = decoded.bytes if decoded is not None else None
        results.append({
            'case': name,
            'expected_text': payload.decode('ascii'),
            'expected_bytes': len(payload),
            'expected_hex': payload.hex(),
            'decoded_hex': actual.hex() if actual is not None else None,
            'exact_match': actual == payload,
        })
    report = {
        'synthetic_only': True,
        'versions': {name: version(name) for name in ('pdf417gen', 'zxing-cpp', 'Pillow')},
        'results': results,
    }
    (ROOT / 'results.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    for result in results:
        print(f"{result['case']}: {'PASS' if result['exact_match'] else 'FAIL'}")
    if not all(result['exact_match'] for result in results):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
