# Account and workspace

Live guides: <https://www.agentrail.co/docs/quickstart.md>,
<https://www.agentrail.co/docs/guides/setup.md>

The person does all of this in a browser window at least 1024 pixels wide.
Give one screen at a time and wait for them to say they are through it.

## Already invited to a team?

If a teammate invited them, they should open the link in the invitation email
and sign up from there. They join that organization without an invite code and
skip "Create the workspace" below. Ask their Admin to make them an Admin if
they will set up sources or feedback.

## Create the account

1. Open <https://app.agentrail.co/signup>. The page says **Create your
   account**.
2. Either select **Sign up with Google**, or fill in **Full name** and **Work
   email** and select **Create account**.
3. **Check your email**: enter the 6-digit code Agentrail emailed. **Resend**
   sends another after a short wait.

Someone who already has an account signs in at
<https://app.agentrail.co/login> (**Welcome back**, then **Log in** or **Log
in with Google**).

## If it asks for an invite code

The page **Enter your invite code** means sign-up is invite-only right now.

- With a code (it looks like `K7QM-3XRF`; case and the dash don't matter):
  enter it under **Invite code** and select **Continue**.
- Without one: select **Request an invite**. Agentrail emails them when they
  are let in, and the next sign-in goes on to create the workspace. Stop the
  setup here and tell them what to do when the email arrives: run this skill
  again.
- Anyone already in an Agentrail organization can share their own code from
  **Settings · Account**.

## Create the workspace

1. **Set up your workspace** (Step 1 of 2): enter the **Company website**,
   such as `example.com`, and select **Create workspace**. Agentrail names the
   organization and workspace after the domain. The website cannot be changed
   later, so check it first. They become the organization's Admin.
2. **Connect your tools** (Step 2 of 2): GitHub (**Recommended**), Slack and
   Linear are optional. Connecting GitHub here lets research read their
   repositories. Then select **Finish setup**.
3. Agentrail opens on **Home** and company research starts in the background.
   It fills the Brand Vault, which decides which later steps apply. They can
   keep going while it runs.

Each account can create one organization. "No organization is available"
means this account already has one or cannot create another: sign in with the
account that owns it, or use an invitation.

## Check it

After step 2 of the skill (connecting their agent), `agentrail workspaces
get-checklist` returns the steps. Before that, the person should see **Home**
and a **Getting started** section in the sidebar.

| They see                                                  | Do this                                                                 |
| --------------------------------------------------------- | ----------------------------------------------------------------------- |
| "Automatic setup is not available right now. Try again later." | Research could not start. Wait a few minutes and select **Finish setup** again. |
| "Setup could not be checked"                              | Select **Try again** in the message.                                    |
| "An account with this email already exists."              | Sign in at `/login` instead.                                            |
| "That code didn't work" or "This sign-in has expired"     | Go back, start again, use the newest email.                            |
