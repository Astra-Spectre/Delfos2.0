from insightface.app import FaceAnalysis
import time

print("Carregando modelo...")

inicio = time.time()

app = FaceAnalysis(
    name="buffalo_l",
    providers=["CUDAExecutionProvider", "CPUExecutionProvider"]
)

app.prepare(ctx_id=0)

fim = time.time()

print(f"Modelo carregado em {fim-inicio:.2f} segundos")
print("Pronto!")