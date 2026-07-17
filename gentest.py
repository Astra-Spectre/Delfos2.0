import onnxruntime as ort

sess = ort.InferenceSession(
    r"C:\Users\campo\.insightface\models\buffalo_l\det_10g.onnx",
    providers=["CUDAExecutionProvider"]
)

print(sess.get_providers())