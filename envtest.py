import cv2
import time
from insightface.app import FaceAnalysis

print("Carregando modelo...")

app = FaceAnalysis(
    name="buffalo_l",
    providers=["CUDAExecutionProvider", "CPUExecutionProvider"]
)

app.prepare(ctx_id=0, det_size=(640, 640))

print("Modelo carregado!")
print("Abrindo câmera...")

cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("Erro ao abrir a câmera.")
    exit()

while True:
    ret, frame = cap.read()

    if not ret:
        break

    inicio = time.time()

    faces = app.get(frame)

    tempo = time.time() - inicio
    fps = 1.0 / tempo if tempo > 0 else 0

    for face in faces:
        box = face.bbox.astype(int)

        cv2.rectangle(
            frame,
            (box[0], box[1]),
            (box[2], box[3]),
            (0, 255, 0),
            2,
        )

        if hasattr(face, "det_score"):
            cv2.putText(
                frame,
                f"{face.det_score:.2f}",
                (box[0], box[1] - 10),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (0, 255, 0),
                2,
            )

    cv2.putText(
        frame,
        f"FPS: {fps:.1f}",
        (20, 40),
        cv2.FONT_HERSHEY_SIMPLEX,
        1,
        (0, 255, 255),
        2,
    )

    cv2.imshow("HermesVision - InsightFace CUDA", frame)

    tecla = cv2.waitKey(1) & 0xFF

    if tecla == 27 or tecla == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()