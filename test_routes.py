from expense_agent.fast_api_app import app
for route in app.routes:
    print(route.path)
