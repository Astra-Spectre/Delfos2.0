import cv2
import time
import onnxruntime as ort
from insightface.app import FaceAnalysis

print("=" * 60)
print("Providers disponíveis:")
print(ort.get_available_providers())
print("=" * 60)

app = FaceAnalysis(
    providers=[
        "CUDAExecutionProvider",
        "CPUExecutionProvider"
    ]
)

app.prepare(
    ctx_id=0,
    det_size=(640, 640)
)

print("\nModelo carregado.\n")

cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("Erro ao abrir a câmera.")
    exit()

while True:

    ret, frame = cap.read()

    if not ret:
        break

    inicio = time.perf_counter()

    faces = app.get(frame)

    tempo = (time.perf_counter() - inicio) * 1000

    for face in faces:

        x1, y1, x2, y2 = map(int, face.bbox)

        cv2.rectangle(
            frame,
            (x1, y1),
            (x2, y2),
            (0, 255, 0),
            2
        )

        cv2.putText(
            frame,
            f"{tempo:.1f} ms",
            (x1, y1 - 10),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 255, 0),
            2
        )

    cv2.imshow("Hermes Vision", frame)

    tecla = cv2.waitKey(1)

    if tecla == 27:
        break

cap.release()
cv2.destroyAllWindows()