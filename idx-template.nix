{ pkgs, projectId, ... }:
{
  bootstrap = ''
    cp -rf ${./.} "$out/"
    chmod -R +w "$out"

    # Apply project ID to configs
    sed -e 's/<project-id>/${projectId}/' ${.idx/dev.nix} > "$out/.idx/dev.nix"

    # Remove the template files themselves and any connection to the template's
    # Git repository
    rm -rf "$out/.git" "$out/idx-template".{nix,json} "$out/node_modules"
  '';
}