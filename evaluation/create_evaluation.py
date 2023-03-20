import os
import io
import tempfile
from git import Repo

def save_file(commit, file, where):
    git_file = commit.tree / file
    full_path = os.path.join(where, file)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, 'w') as f:    
        with io.BytesIO(git_file.data_stream.read()) as git_stream:
            f.write(git_stream.read().decode('utf-8'))

def save_files(commit, commit_dir):
    parent = commit.parents[0]
    print(commit)
    for file in commit.stats.files:
        try:
            save_file(parent, file, os.path.join(commit_dir, "before"))
        except: 
            pass
        try:
            save_file(commit, file, os.path.join(commit_dir, "after"))
        except: 
            pass

def save_commit(tmp_dir, commit_url):
    url = commit_url.split("/commit/")
    commit = url[1]
    project = url[0][url[0].rindex("/") + 1:]
    clone_url = f"https://github.com/refdiff-study/{project}.git"
    repo_folder = os.path.join(tmp_dir, f"{project}.git")

    saved_folder = os.path.join('./', project, commit)
    if os.path.exists(saved_folder): return

    os.makedirs(os.path.join(saved_folder, "before"), exist_ok=True)
    os.makedirs(os.path.join(saved_folder, "after"), exist_ok=True)

    if os.path.exists(repo_folder):
        repo = Repo(repo_folder)
        assert repo.bare
    else:
        repo = Repo.clone_from(clone_url, repo_folder, bare=True)

    save_files(repo.commit(commit), saved_folder)

# Evaluation examples taken from https://github.com/aserg-ufmg/RefDiff/blob/master/refdiff-evaluation/src/test/java/refdiff/evaluation/js/ComputeRecallJs.java
commits_to_save = [
    # Move Function
    # RelationshipType.MOVE, node("lib/WebpackOptionsValidationError.js", "getSchemaPartText"), node("lib/util/getSchemaPartText.js", "getSchemaPartText")
    "https://github.com/webpack/webpack/commit/b50d4cf7c370dc0f9fa2c39ea0e73e28ca8918ac",

    # Move And Rename Function
    # RelationshipType.MOVE_RENAME, node("lib/Entrypoint.js", "getSize"), node("lib/SizeFormatHelpers.js", "getEntrypointSize")
    "https://github.com/webpack/webpack/commit/5da9d8c7ef29f954a37f58f5138f116579c6efe8",
		
    # Extract Function
    # RelationshipType.EXTRACT, node("src/renderers/shared/fiber/ReactFiberScheduler.js", "commitAllWork"), node("src/renderers/shared/fiber/ReactFiberScheduler.js", "commitAllHostEffects")
    "https://github.com/facebook/react/commit/24a83a5eeb1ccf4da1bdd97166d6c7c94d821bd8",

    # Inline Function
    # RelationshipType.INLINE, node("packages/dynamic-import/cache.js", "put"), node("packages/dynamic-import/cache.js", "flushSetMany")
    "https://github.com/meteor/meteor/commit/ec3341e7adb89889deadc1d3ecd8d8a181b958f1",
    
    # Rename Function
    # RelationshipType.RENAME, node("src/renderers/shared/fiber/ReactFiberScheduler.js", "findNextUnitOfWork"), node("src/renderers/shared/fiber/ReactFiberScheduler.js", "resetNextUnitOfWork")
    "https://github.com/facebook/react/commit/71f591501b639c4adf329e1f586c7e04875dde7f",

    # Rename File
    # RelationshipType.RENAME, node("Libraries/Components/StaticContainer.js", "StaticContainer.js"), node("Libraries/Components/StaticContainer.react.js", "StaticContainer.react.js")
    "https://github.com/facebook/react-native/commit/57daad98f01b59fce9cb9bf663fd0b191c56b232",

    # Move File
    # RelationshipType.MOVE, node("test/configCases/plugins/dll-plugin/webpack.config.js", "webpack.config.js"), node("test/configCases/plugins/lib-manifest-plugin/webpack.config.js", "webpack.config.js")
    "https://github.com/webpack/webpack/commit/756f2ca1779fd9836412041cbc9baa7912d490ae",

    # Move And Rename File
    # RelationshipType.MOVE_RENAME, node("lib/BaseWasmMainTemplatePlugin.js", "BaseWasmMainTemplatePlugin.js"), node("lib/wasm/WasmMainTemplatePlugin.js", "WasmMainTemplatePlugin.js")
    "https://github.com/webpack/webpack/commit/9156be961d890b9877ddef3a70964c9665662abb"

    # Rename class
    # RelationshipType.RENAME, node("lib/BaseWasmMainTemplatePlugin.js", "BaseWasmMainTemplatePlugin"), node("lib/wasm/WasmMainTemplatePlugin.js", "WasmMainTemplatePlugin")
    "https://github.com/webpack/webpack/commit/9156be961d890b9877ddef3a70964c9665662abb"
    
    # Function added
    # RelationshipType.ADDED, undefined, node("src/renderers/shared/fiber/ReactFiberScheduler.js", "performWorkCatchBlock")
    "https://github.com/webpack/webpack/commit/9156be961d890b9877ddef3a70964c9665662abb"

    
]

with tempfile.TemporaryDirectory() as tmp_dir:
    for url in commits_to_save:
        print(f"Saving {url}")
        save_commit(tmp_dir, url)