#!/usr/bin/env python3
# PaddleOCR service for zhijian cloud hosting
# Reads base64 image from stdin, outputs OCR text as JSON to stdout

import sys
import json
import base64
import traceback

try:
    from paddleocr import PaddleOCR
    ocr = PaddleOCR(use_angle_cls=False, lang='ch', show_log=False)
except Exception as e:
    print(json.dumps({"error": "PaddleOCR init failed: " + str(e)}))
    sys.exit(1)

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        # File path mode
        if not line.startswith('data:') and not line.startswith('/9j/'):
            result = ocr.ocr(line, cls=False)
        else:
            # Base64 mode
            if line.startswith('data:image'):
                line = line.split(',', 1)[1]
            import tempfile, os
            img_data = base64.b64decode(line)
            fd, tmp = tempfile.mkstemp(suffix='.png')
            os.write(fd, img_data)
            os.close(fd)
            result = ocr.ocr(tmp, cls=False)
            os.unlink(tmp)

        texts = []
        if result and result[0]:
            for box in result[0]:
                if box[1][0]:
                    texts.append(box[1][0])
        print(json.dumps({"text": "\n".join(texts)}), flush=True)
    except Exception as e:
        print(json.dumps({"error": str(e), "trace": traceback.format_exc()}), flush=True)
