import cv2
from insightface.app import FaceAnalysis
import time

app = FaceAnalysis(
    name="buffalo_l",
    providers=["CUDAExecutionProvider", "CPUExecutionProvider"]
)

app.prepare(ctx_id=0)

camera = cv2.VideoCapture(1)

fps = 0
t0 = time.time()

while True:

    ok, frame = camera.read()

    if not ok:
        break

    faces = app.get(frame)

    for face in faces:

        x1,y1,x2,y2 = face.bbox.astype(int)

        cv2.rectangle(frame,(x1,y1),(x2,y2),(0,255,0),2)

        cv2.putText(
            frame,
            f"{face.det_score:.2f}",
            (x1,y1-10),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0,255,0),
            2
        )

    fps += 1

    if time.time()-t0 >= 1:

        cv2.putText(
            frame,
            f"FPS {fps}",
            (20,40),
            cv2.FONT_HERSHEY_SIMPLEX,
            1,
            (0,255,255),
            2
        )

        fps = 0
        t0 = time.time()

    cv2.imshow("Hermes Vision",frame)

    if cv2.waitKey(1)==27:
        break

camera.release()
cv2.destroyAllWindows()