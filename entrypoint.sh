if test -z "${DOTENV_LOCAL}" ; then
    if ! test -f "/app/config/.env.local" ; then
        echo "DOTENV_LOCAL was not found in the ENV variables and .env.local is not set using a bind volume. We are using the default .env config."
    fi;
else
    echo "DOTENV_LOCAL was found in the ENV variables. Creating config/.env.local file."
    cat <<< "$DOTENV_LOCAL" > /app/config/.env.local
fi;

if [ "$USE_LOCAL_DB" = true ] ; then
    echo "USE_LOCAL_DB is set to true. Appending MONGODB_URL"

    touch /app/config/.env.local
    echo -e "\nMONGODB_URL=mongodb://localhost:27017" >> /app/config/.env.local

    mkdir -p /data/db
    mongod &
    echo "Starting local MongoDB instance"

fi;

npm run build
npm run preview -- --host 0.0.0.0 --port 3000